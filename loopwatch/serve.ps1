# serve.ps1 — zero-dependency static file server for Loopwatch.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8080
#
# Uses the built-in System.Net.HttpListener. No Python, Node, or install
# required — works on any stock Windows machine. For production hosting
# just push to GitHub Pages (see README.md).

param(
    [int]$Port = 8080,
    [string]$Root = $PSScriptRoot
)

$prefix = "http://localhost:$Port/"
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Error "Failed to bind $prefix. Port busy or permissions?"
    exit 1
}

Write-Host "[loopwatch] serving $Root at $prefix"
Write-Host "[loopwatch] Ctrl+C to stop"

# Minimal MIME map. Covers everything this project actually loads.
$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".webp" = "image/webp"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
    ".wav"  = "audio/wav"
    ".ogg"  = "audio/ogg"
    ".mp3"  = "audio/mpeg"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".txt"  = "text/plain; charset=utf-8"
    ".md"   = "text/markdown; charset=utf-8"
}

while ($listener.IsListening) {
    try {
        $ctx = $listener.GetContext()
    } catch {
        break
    }

    $req = $ctx.Request
    $res = $ctx.Response

    $relPath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrEmpty($relPath)) { $relPath = "index.html" }

    # Prevent directory traversal.
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root $relPath))
    $rootFull = [System.IO.Path]::GetFullPath($Root)
    if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
        $res.Close()
        continue
    }

    # Fall back to index.html inside directories.
    if (Test-Path $full -PathType Container) {
        $full = Join-Path $full "index.html"
    }

    if (Test-Path $full -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
        $type = $mime[$ext]
        if (-not $type) { $type = "application/octet-stream" }

        try {
            $bytes = [System.IO.File]::ReadAllBytes($full)
            $res.ContentType = $type
            $res.ContentLength64 = $bytes.Length
            $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            if ($req.HttpMethod -ne "HEAD") {
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
            $status = 200
        } catch {
            $res.StatusCode = 500
            $status = 500
        }
    } else {
        $res.StatusCode = 404
        $status = 404
    }

    Write-Host ("[{0}] {1} {2}" -f $status, $req.HttpMethod, $relPath)
    $res.Close()
}
