<?php
declare(strict_types=1);

// API del catalogo. La configurazione con la password non va pubblicata.
$localConfig = __DIR__ . '/config.local.php';
$config = is_file($localConfig) ? require $localConfig : [];
$passwordHash = is_array($config) ? (string)($config['admin_password_hash'] ?? '') : '';
$storageDir = __DIR__ . '/storage';
$uploadsDir = __DIR__ . '/uploads';
$dataFile = $storageDir . '/artworks.json';
$maxUploadBytes = 25 * 1024 * 1024;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function requestBody(): array
{
    $raw = file_get_contents('php://input');
    $body = json_decode($raw === false ? '' : $raw, true);
    return is_array($body) ? $body : [];
}

function ensureDirectories(string $storageDir, string $uploadsDir): void
{
    foreach ([$storageDir, $uploadsDir] as $directory) {
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
            respond(500, ['error' => 'Impossibile preparare le cartelle del catalogo.']);
        }
    }
}

function readArtworks(string $dataFile): array
{
    if (!is_file($dataFile)) return [];
    $json = file_get_contents($dataFile);
    $data = json_decode($json === false ? '' : $json, true);
    if (!is_array($data)) respond(500, ['error' => 'Archivio opere non valido.']);
    foreach ($data as &$artwork) {
        if (!is_array($artwork)) continue;
        $artwork['image'] = normalizeImagePath($artwork['image'] ?? null) ?? (string)($artwork['image'] ?? '');
        $artwork['extras'] = normalizeImageList($artwork['extras'] ?? []);
        if (isset($artwork['reviews']) && is_array($artwork['reviews'])) {
            foreach ($artwork['reviews'] as &$review) {
                if (is_array($review) && !empty($review['photo'])) {
                    $review['photo'] = normalizeImagePath($review['photo']) ?? $review['photo'];
                }
            }
            unset($review);
        }
    }
    unset($artwork);
    return array_values($data);
}

function writeArtworks(string $dataFile, array $artworks): void
{
    $json = json_encode(array_values($artworks), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents($dataFile, $json . "\n", LOCK_EX) === false) {
        respond(500, ['error' => 'Impossibile salvare l’archivio delle opere.']);
    }
}

function requireAdmin(): void
{
    if (empty($_SESSION['admin_authenticated'])) respond(401, ['error' => 'Accesso amministrativo richiesto.']);
    $sentToken = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    $sessionToken = (string)($_SESSION['csrf_token'] ?? '');
    if ($sentToken === '' || $sessionToken === '' || !hash_equals($sessionToken, $sentToken)) {
        respond(403, ['error' => 'Token di sicurezza non valido.']);
    }
}

function normalizeImagePath($value): ?string
{
    if (!is_string($value) || $value === '') return null;
    $path = parse_url($value, PHP_URL_PATH);
    if (!is_string($path) || preg_match('#(?:^|/)uploads/([a-f0-9]{32}\.(?:jpg|png|gif|webp))$#i', $path, $matches) !== 1) return null;
    return 'uploads/' . strtolower($matches[1]);
}

function normalizeImageList($value): array
{
    if (is_string($value)) $value = [$value];
    if (!is_array($value)) return [];
    $paths = [];
    foreach ($value as $path) {
        $normalized = normalizeImagePath($path);
        if ($normalized !== null) $paths[] = $normalized;
    }
    return array_values(array_unique($paths));
}

function saveUploadedFile(array $file, string $uploadsDir, int $maxUploadBytes): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        respond(400, ['error' => 'Caricamento immagine non riuscito.']);
    }
    if (($file['size'] ?? 0) > $maxUploadBytes || !is_uploaded_file($file['tmp_name'] ?? '')) {
        respond(400, ['error' => 'Immagine troppo grande o non valida (limite 25 MB per file).']);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime]) || @getimagesize($file['tmp_name']) === false) {
        respond(400, ['error' => 'Formato immagine non supportato. Usa JPEG, PNG, GIF o WebP.']);
    }
    $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($file['tmp_name'], $uploadsDir . '/' . $filename)) {
        respond(500, ['error' => 'Impossibile salvare l’immagine sul server.']);
    }
    return 'uploads/' . $filename;
}

ensureDirectories($storageDir, $uploadsDir);
if (!is_file($dataFile)) file_put_contents($dataFile, "[]\n", LOCK_EX);

$isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_set_cookie_params(['httponly' => true, 'secure' => $isHttps, 'samesite' => 'Strict', 'path' => '/']);
session_start();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body = $method === 'POST' ? requestBody() : [];
$action = (string)($_GET['action'] ?? $_POST['action'] ?? $body['action'] ?? 'artworks');

if ($action === 'artworks' && $method === 'GET') {
    respond(200, ['artworks' => readArtworks($dataFile)]);
}

if ($action === 'login' && $method === 'POST') {
    $hashNotConfigured = $passwordHash === '' || strpos($passwordHash, 'INCOLLA_QUI_') === 0;
    if ($hashNotConfigured || !password_verify((string)($body['password'] ?? ''), $passwordHash)) {
        usleep(300000);
        respond($hashNotConfigured ? 503 : 401, ['error' => $hashNotConfigured ? 'Configura la password amministrativa sul server.' : 'Password non corretta.']);
    }
    session_regenerate_id(true);
    $_SESSION['admin_authenticated'] = true;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    respond(200, ['authenticated' => true, 'csrfToken' => $_SESSION['csrf_token']]);
}

if ($action === 'auth' && $method === 'GET') {
    respond(200, ['authenticated' => !empty($_SESSION['admin_authenticated']), 'csrfToken' => $_SESSION['csrf_token'] ?? null]);
}

if ($action === 'logout' && $method === 'POST') {
    requireAdmin();
    $_SESSION = [];
    session_destroy();
    respond(200, ['authenticated' => false]);
}

if ($method !== 'POST') respond(405, ['error' => 'Metodo non consentito.']);
requireAdmin();
$artworks = readArtworks($dataFile);

if ($action === 'save') {
    $artwork = json_decode((string)($_POST['artwork'] ?? ''), true);
    if (!is_array($artwork)) respond(400, ['error' => 'Dati dell’opera non validi.']);
    $id = (string)($artwork['id'] ?? '');
    if ($id === '') $id = 'art-' . bin2hex(random_bytes(12));
    if (preg_match('/^[a-zA-Z0-9_-]{1,80}$/', $id) !== 1) respond(400, ['error' => 'Identificativo opera non valido.']);
    $index = null;
    foreach ($artworks as $key => $item) if (($item['id'] ?? null) === $id) $index = $key;
    $previous = $index === null ? [] : $artworks[$index];
    $artwork['id'] = $id;
    $artwork['title'] = trim((string)($artwork['title'] ?? ''));
    if ($artwork['title'] === '') respond(400, ['error' => 'Il titolo dell’opera è obbligatorio.']);
    if ($index === null && empty($_FILES['mainImage']['name'])) respond(400, ['error' => 'Carica un’immagine principale per la nuova opera.']);
    $artwork['image'] = normalizeImagePath($previous['image'] ?? null)
        ?? normalizeImagePath($artwork['image'] ?? null)
        ?? (string)($previous['image'] ?? '');
    $artwork['extras'] = normalizeImageList($artwork['extras'] ?? $previous['extras'] ?? []);
    $incomingReviews = is_array($artwork['reviews'] ?? null) ? $artwork['reviews'] : [];
    $artwork['reviews'] = is_array($previous['reviews'] ?? null) ? $previous['reviews'] : [];
    if (isset($incomingReviews[0]) && is_array($incomingReviews[0])) {
        $artwork['reviews'][0] = array_merge($artwork['reviews'][0] ?? [], $incomingReviews[0]);
    }

    if (isset($_FILES['mainImage']) && ($_FILES['mainImage']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $artwork['image'] = saveUploadedFile($_FILES['mainImage'], $uploadsDir, $maxUploadBytes);
    }
    if (isset($_FILES['extraImages'])) {
        $files = $_FILES['extraImages'];
        foreach (($files['name'] ?? []) as $i => $_name) {
            if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
            $artwork['extras'][] = saveUploadedFile(['name' => $files['name'][$i], 'type' => $files['type'][$i], 'tmp_name' => $files['tmp_name'][$i], 'error' => $files['error'][$i], 'size' => $files['size'][$i]], $uploadsDir, $maxUploadBytes);
        }
    }
    if (isset($_FILES['reviewPhoto']) && ($_FILES['reviewPhoto']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        $photoPath = saveUploadedFile($_FILES['reviewPhoto'], $uploadsDir, $maxUploadBytes);
        if (!isset($artwork['reviews'][0])) $artwork['reviews'][0] = ['name' => '', 'text' => ''];
        $artwork['reviews'][0]['photo'] = $photoPath;
    }
    $artwork['extras'] = normalizeImageList($artwork['extras']);
    $artwork['isCover'] = !empty($artwork['isCover']);
    if ($artwork['isCover']) foreach ($artworks as &$item) $item['isCover'] = false;
    unset($item);
    if ($index === null) $artworks[] = $artwork; else $artworks[$index] = $artwork;
    writeArtworks($dataFile, $artworks);
    respond(200, ['artwork' => $artwork]);
}

if ($action === 'delete') {
    $id = (string)($body['id'] ?? '');
    foreach ($artworks as $index => $artwork) {
        if (($artwork['id'] ?? null) !== $id) continue;
        array_splice($artworks, $index, 1);
        writeArtworks($dataFile, $artworks);
        respond(200, ['deleted' => true]);
    }
    respond(404, ['error' => 'Opera non trovata.']);
}

respond(400, ['error' => 'Azione API non riconosciuta.']);
