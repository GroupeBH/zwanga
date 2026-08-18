param()

Add-Type -AssemblyName System.Drawing

$assetDirectory = Join-Path $PSScriptRoot '..\assets\images\map-markers'
$navy = [System.Drawing.ColorTranslator]::FromHtml('#304B77')
$orange = [System.Drawing.ColorTranslator]::FromHtml('#FF6B35')
$femalePink = [System.Drawing.ColorTranslator]::FromHtml('#EC4899')
$white = [System.Drawing.Color]::White

function New-Point([single]$x, [single]$y) {
  return [System.Drawing.PointF]::new($x, $y)
}

function Draw-Line(
  [System.Drawing.Graphics]$graphics,
  [System.Drawing.Pen]$pen,
  [single]$x1,
  [single]$y1,
  [single]$x2,
  [single]$y2
) {
  $graphics.DrawLine($pen, $x1, $y1, $x2, $y2)
}

function Draw-GenderIcon(
  [System.Drawing.Graphics]$graphics,
  [ValidateSet('male', 'female', 'neutral')]
  [string]$gender
) {
  $bodyBrush = [System.Drawing.SolidBrush]::new($white)
  $limbPen = [System.Drawing.Pen]::new($white, 4)
  $limbPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $limbPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  try {
    $graphics.FillEllipse($bodyBrush, 25, 12.5, 10, 10)

    switch ($gender) {
      'male' {
        $graphics.FillEllipse($bodyBrush, 20.5, 23.5, 19, 10)
        $graphics.FillRectangle($bodyBrush, 22.5, 28, 15, 10)
        Draw-Line $graphics $limbPen 21.5 28 20.5 38
        Draw-Line $graphics $limbPen 38.5 28 39.5 38

        $legPen = [System.Drawing.Pen]::new($white, 4.8)
        $legPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $legPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        try {
          Draw-Line $graphics $legPen 27 36.5 27 45
          Draw-Line $graphics $legPen 33 36.5 33 45
        }
        finally {
          $legPen.Dispose()
        }
      }
      'female' {
        $dress = [System.Drawing.PointF[]]@(
          (New-Point 24 23.5),
          (New-Point 36 23.5),
          (New-Point 41 40),
          (New-Point 19 40)
        )
        $graphics.FillPolygon($bodyBrush, $dress)
        Draw-Line $graphics $limbPen 23.5 27 18.5 37
        Draw-Line $graphics $limbPen 36.5 27 41.5 37
        Draw-Line $graphics $limbPen 27 39 27 45
        Draw-Line $graphics $limbPen 33 39 33 45
      }
      'neutral' {
        $graphics.FillEllipse($bodyBrush, 21.5, 24, 17, 13)
        $graphics.FillRectangle($bodyBrush, 25, 29, 10, 10)
        Draw-Line $graphics $limbPen 27.5 37 27 44
        Draw-Line $graphics $limbPen 32.5 37 33 44
      }
    }
  }
  finally {
    $limbPen.Dispose()
    $bodyBrush.Dispose()
  }
}

function Draw-RequestBadge([System.Drawing.Graphics]$graphics) {
  $whiteBrush = [System.Drawing.SolidBrush]::new($white)
  $badgeBrush = [System.Drawing.SolidBrush]::new($orange)
  $documentPen = [System.Drawing.Pen]::new($white, 1.35)
  $documentPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $documentPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $documentPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  try {
    $graphics.FillEllipse($whiteBrush, 38, 1, 21, 21)
    $graphics.FillEllipse($badgeBrush, 40.5, 3.5, 16, 16)

    $page = [System.Drawing.PointF[]]@(
      (New-Point 46 7),
      (New-Point 51 7),
      (New-Point 53 9),
      (New-Point 53 16),
      (New-Point 46 16),
      (New-Point 46 7)
    )
    $graphics.DrawLines($documentPen, $page)
    Draw-Line $graphics $documentPen 51 7 51 10
    Draw-Line $graphics $documentPen 51 10 53 10
    Draw-Line $graphics $documentPen 48 12 51 12
    Draw-Line $graphics $documentPen 48 14 51 14
  }
  finally {
    $documentPen.Dispose()
    $badgeBrush.Dispose()
    $whiteBrush.Dispose()
  }
}

function New-TripRequestMarker(
  [ValidateSet('male', 'female', 'neutral')]
  [string]$gender,
  [ValidateSet(1, 2)]
  [int]$scale
) {
  $width = 60 * $scale
  $height = 64 * $scale
  $bitmap = [System.Drawing.Bitmap]::new(
    $width,
    $height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $whiteBrush = [System.Drawing.SolidBrush]::new($white)
  $markerColor = if ($gender -eq 'female') { $femalePink } else { $navy }
  $markerBrush = [System.Drawing.SolidBrush]::new($markerColor)

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.ScaleTransform($scale, $scale)

    $outerTip = [System.Drawing.PointF[]]@(
      (New-Point 20.5 42.5),
      (New-Point 39.5 42.5),
      (New-Point 30 60)
    )
    $innerTip = [System.Drawing.PointF[]]@(
      (New-Point 24 43),
      (New-Point 36 43),
      (New-Point 30 56.5)
    )
    $graphics.FillPolygon($whiteBrush, $outerTip)
    $graphics.FillPolygon($markerBrush, $innerTip)

    $graphics.FillEllipse($whiteBrush, 6, 4, 48, 48)
    $graphics.FillEllipse($markerBrush, 9, 7, 42, 42)

    Draw-GenderIcon $graphics $gender
    Draw-RequestBadge $graphics

    $suffix = if ($scale -eq 2) { '@2x' } else { '' }
    $outputPath = Join-Path $assetDirectory "trip-request-marker-$gender$suffix.png"
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Generated $outputPath"
  }
  finally {
    $markerBrush.Dispose()
    $whiteBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

foreach ($gender in @('male', 'female', 'neutral')) {
  New-TripRequestMarker $gender 1
  New-TripRequestMarker $gender 2
}
