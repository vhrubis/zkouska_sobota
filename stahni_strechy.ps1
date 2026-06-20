# Stahuje ortofoto vyrez kazde budovy Litvinova z CUZK ArcGIS REST (arcgis1/ORTOFOTO)
# Vstup:  data\budovy_litvinov.json  (Overpass "out bb;")
# Vystup: litvinov_strechy\*.png  +  litvinov_strechy_index.csv
# Cestu odvozujeme z $PSScriptRoot (zadne literaly se specialnimi znaky -> zadny problem s kodovanim)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base      = $PSScriptRoot
$inFile    = Join-Path $base "data\budovy_litvinov.json"
$outDir    = Join-Path $base "litvinov_strechy"
$indexFile = Join-Path $base "litvinov_strechy_index.csv"
$logFile   = Join-Path $base "data\stahovani_log.txt"
$exportBase = "https://ags.cuzk.gov.cz/arcgis1/rest/services/ORTOFOTO/MapServer/export"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $base "data") | Out-Null

function To3857($lon, $lat) {
  $x = $lon * 20037508.342789244 / 180.0
  $y = [Math]::Log([Math]::Tan((90.0 + $lat) * [Math]::PI / 360.0)) / ([Math]::PI / 180.0)
  $y = $y * 20037508.342789244 / 180.0
  return @($x, $y)
}

$json = Get-Content -Path $inFile -Raw -Encoding UTF8 | ConvertFrom-Json
$elements = $json.elements | Where-Object { $_.bounds -ne $null }
$total = $elements.Count
"START total=$total" | Out-File $logFile -Encoding UTF8

$done = 0; $skip = 0; $fail = 0; $i = 0
foreach ($el in $elements) {
  $i++
  $name = "$($el.type)_$($el.id).png"
  $fpath = Join-Path $outDir $name

  if ((Test-Path $fpath) -and ((Get-Item $fpath).Length -gt 1000)) { $skip++; continue }

  $b = $el.bounds
  $lat = ($b.minlat + $b.maxlat) / 2.0
  $lon = ($b.minlon + $b.maxlon) / 2.0
  $cosLat = [Math]::Cos($lat * [Math]::PI / 180.0)
  $hM = ($b.maxlat - $b.minlat) * 111320.0
  $wM = ($b.maxlon - $b.minlon) * 111320.0 * $cosLat
  $sideM = [Math]::Max($wM, $hM) * 1.4
  if ($sideM -lt 25) { $sideM = 25 }
  if ($sideM -gt 220) { $sideM = 220 }

  $c = To3857 $lon $lat
  $half = ($sideM / $cosLat) / 2.0
  $bbox = "$($c[0]-$half),$($c[1]-$half),$($c[0]+$half),$($c[1]+$half)"
  $url = "$exportBase`?bbox=$bbox&bboxSR=3857&imageSR=3857&size=224,224&format=png&f=image"

  $ok = $false
  for ($try = 1; $try -le 3 -and -not $ok; $try++) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $fpath -Headers @{ "User-Agent" = "AIO-LitvinovRoofs/1.0" } -TimeoutSec 60
      if ((Get-Item $fpath).Length -gt 1000) { $ok = $true }
    } catch {
      Start-Sleep -Milliseconds (300 * $try)
    }
  }

  if ($ok) { $done++ } else { $fail++; "FAIL $name" | Out-File $logFile -Append -Encoding UTF8 }

  if ($i % 100 -eq 0) {
    "$(Get-Date -Format HH:mm:ss)  $i/$total  done=$done skip=$skip fail=$fail" | Out-File $logFile -Append -Encoding UTF8
  }
  Start-Sleep -Milliseconds 100
}

# Sestaveni kompletniho indexu ze vsech stazenych PNG (robustni i po resume)
"file,osm_type,osm_id,lon,lat" | Out-File $indexFile -Encoding UTF8
$rows = 0
foreach ($el in $elements) {
  $name = "$($el.type)_$($el.id).png"
  $fpath = Join-Path $outDir $name
  if ((Test-Path $fpath) -and ((Get-Item $fpath).Length -gt 1000)) {
    $b = $el.bounds
    $lat = ($b.minlat + $b.maxlat) / 2.0
    $lon = ($b.minlon + $b.maxlon) / 2.0
    "$name,$($el.type),$($el.id),$lon,$lat" | Out-File $indexFile -Append -Encoding UTF8
    $rows++
  }
}

"DONE done=$done skip=$skip fail=$fail total=$total index_rows=$rows" | Out-File $logFile -Append -Encoding UTF8
"HOTOVO: stazeno=$done preskoceno=$skip chyby=$fail celkem=$total index=$rows"
