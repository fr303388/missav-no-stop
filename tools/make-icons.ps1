Add-Type -AssemblyName System.Drawing

$out = Join-Path (Split-Path $PSScriptRoot -Parent) 'icons'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

function New-PlayIcon([int]$size, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  $c = $size / 2.0
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 38, 110, 255), [System.Drawing.Color]::FromArgb(255, 20, 60, 120), 45.0)

  $pad = [float]($size * 0.04)
  $g.FillEllipse($brush, $pad, $pad, $size - 2 * $pad, $size - 2 * $pad)

  $p1 = New-Object System.Drawing.PointF([float]($size * 0.38), [float]($size * 0.28))
  $p2 = New-Object System.Drawing.PointF([float]($size * 0.38), [float]($size * 0.72))
  $p3 = New-Object System.Drawing.PointF([float]($size * 0.74), [float]$c)
  $tri = New-Object System.Drawing.PointF[] 3
  $tri[0] = $p1; $tri[1] = $p2; $tri[2] = $p3
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $g.FillPolygon($white, $tri)

  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $white.Dispose(); $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

New-PlayIcon 16 (Join-Path $out 'icon16.png')
New-PlayIcon 48 (Join-Path $out 'icon48.png')
New-PlayIcon 128 (Join-Path $out 'icon128.png')
Write-Output "icons created in $out"
