# Vytvori ocislovane montaze (mrizky) snimku z label_pool.json pro rucni labelovani.
# Vystup: scratchpad/montage_N.png + data/label_map.csv (index,file,pool)
Add-Type -AssemblyName System.Drawing

$base = $PSScriptRoot
$imgDir = Join-Path $base "litvinov_strechy"
$outDir = "C:\Users\JI10BB~1\AppData\Local\Temp\claude\C--Users-Ji---zkouska-sobota\e2159d18-c9cf-468d-b31f-22dca230284d\scratchpad"
$pool = Get-Content (Join-Path $base "data\label_pool.json") -Raw -Encoding UTF8 | ConvertFrom-Json

# poradi + deduplikace
$seen = @{}; $items = New-Object System.Collections.ArrayList
foreach ($p in 'haly', 'fve', 'rezidence') {
  foreach ($f in $pool.$p) { if (-not $seen[$f]) { $seen[$f] = $true; [void]$items.Add([pscustomobject]@{ file = $f; pool = $p }) } }
}

# mapping CSV
$lines = @("index,file,pool")
for ($i = 0; $i -lt $items.Count; $i++) { $lines += "$($i+1),$($items[$i].file),$($items[$i].pool)" }
Set-Content -Path (Join-Path $base "data\label_map.csv") -Value $lines -Encoding UTF8

# parametry mrizky (lze predat: montaz.ps1 <per> <cols> <thumb>)
$per = if ($args[0]) { [int]$args[0] } else { 12 }
$cols = if ($args[1]) { [int]$args[1] } else { 3 }
$thumb = if ($args[2]) { [int]$args[2] } else { 210 }
$lblH = 26; $cellH = $thumb + $lblH
$rows = [Math]::Ceiling($per / $cols)
$W = $cols * $thumb
$H = $rows * $cellH

$font = New-Object System.Drawing.Font("Arial", 13, [System.Drawing.FontStyle]::Bold)
$nMont = [Math]::Ceiling($items.Count / $per)

for ($m = 0; $m -lt $nMont; $m++) {
  $bmp = New-Object System.Drawing.Bitmap($W, $H)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(20, 30, 50))
  for ($k = 0; $k -lt $per; $k++) {
    $idx = $m * $per + $k
    if ($idx -ge $items.Count) { break }
    $row = [Math]::Floor($k / $cols); $col = $k % $cols
    $x = $col * $thumb; $y = $row * $cellH
    $num = $idx + 1
    # cislo
    $g.FillRectangle([System.Drawing.Brushes]::Black, $x, $y, $thumb, $lblH)
    $g.DrawString("$num", $font, [System.Drawing.Brushes]::Yellow, ($x + 4), ($y + 3))
    # obrazek
    $fp = Join-Path $imgDir $items[$idx].file
    try {
      $img = [System.Drawing.Image]::FromFile($fp)
      $rect = New-Object System.Drawing.Rectangle($x, ($y + $lblH), $thumb, $thumb)
      $g.DrawImage($img, $rect)
      $img.Dispose()
    } catch {}
  }
  $g.Dispose()
  $path = Join-Path $outDir "montage_$($m+1).png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "ulozeno $path"
}
"montazi: $nMont, polozek: $($items.Count)"
