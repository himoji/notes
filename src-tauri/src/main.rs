#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use local_ip_address::local_ip;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use reqwest;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Wry};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    title: String,
    content: String,
    datetime: String,
    attachments: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SyncRequest {
    peer_id: String,
    peer_name: String,
    note: Note,
    attachments_data: HashMap<String, Vec<u8>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PeerDevice {
    id: String,
    name: String,
    ip: IpAddr,
    port: u16,
}

// Structure to hold server binding information
#[derive(Debug, Clone)]
struct BindInfo {
    ip: IpAddr,
    port: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
enum SyncStatus {
    Pending,
    Accepted,
    Rejected,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SyncNotification {
    id: String,
    from_peer: PeerDevice,
    note_title: String,
    status: SyncStatus,
}

// State to track discovered peers and sync notifications
struct AppState {
    device_id: String,
    device_name: String,
    peers: HashMap<String, PeerDevice>,
    sync_notifications: Vec<SyncNotification>,
}

fn get_notes_dir(app_handle: &AppHandle<Wry>) -> PathBuf {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data directory");
    path.push("notes");
    fs::create_dir_all(&path).expect("Failed to create notes directory");
    path
}

fn get_attachments_dir(app_handle: &AppHandle<Wry>, note_id: &str) -> PathBuf {
    let mut path = get_notes_dir(app_handle);
    path.push("attachments");
    path.push(note_id);
    fs::create_dir_all(&path).expect("Failed to create attachments directory");
    path
}

fn get_note_path(app_handle: &AppHandle<Wry>, id: &str) -> PathBuf {
    let mut path = get_notes_dir(app_handle);
    path.push(format!("{}.md", id));
    path
}

#[tauri::command]
async fn get_notes(app_handle: AppHandle<Wry>) -> Result<Vec<Note>, String> {
    let notes_dir = get_notes_dir(&app_handle);
    let mut notes = Vec::new();

    for entry in fs::read_dir(notes_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;

        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Some(id) = path.file_stem().and_then(|s| s.to_str()) {
                let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;

                // Get attachments for this note
                let attachments_dir = get_attachments_dir(&app_handle, id);
                let mut attachments = Vec::new();
                if attachments_dir.exists() {
                    for attachment in fs::read_dir(attachments_dir).map_err(|e| e.to_string())? {
                        if let Ok(attachment) = attachment {
                            if let Some(name) = attachment.file_name().to_str() {
                                attachments.push(name.to_string());
                            }
                        }
                    }
                }

                // Parse the first line as title if it starts with #
                let mut lines = content.lines();
                let title = lines
                    .next()
                    .and_then(|line| {
                        if line.starts_with("# ") {
                            Some(line[2..].to_string())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| "Untitled".to_string());

                let note = Note {
                    id: id.to_string(),
                    title,
                    content,
                    datetime: entry
                        .metadata()
                        .map_err(|e| e.to_string())?
                        .modified()
                        .map_err(|e| e.to_string())?
                        .duration_since(std::time::UNIX_EPOCH)
                        .map_err(|e| e.to_string())?
                        .as_secs_f64()
                        .to_string(),
                    attachments,
                };
                notes.push(note);
            }
        }
    }

    notes.sort_by(|a, b| b.datetime.partial_cmp(&a.datetime).unwrap());
    Ok(notes)
}

#[tauri::command]
async fn save_note(app_handle: AppHandle<Wry>, note: Note) -> Result<(), String> {
    let path = get_note_path(&app_handle, &note.id);
    let note_content = format!("# {}\n\n{}", note.title, note.content); // Prepend title as markdown header
    fs::write(path, note_content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_note(app_handle: AppHandle<Wry>, note_id: String) -> Result<(), String> {
    // Delete the note file
    let note_path = get_note_path(&app_handle, &note_id);
    if note_path.exists() {
        fs::remove_file(note_path).map_err(|e| e.to_string())?;
    }

    // Delete attachments directory
    let attachments_dir = get_attachments_dir(&app_handle, &note_id);
    if attachments_dir.exists() {
        fs::remove_dir_all(attachments_dir).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn save_attachment(
    app_handle: AppHandle<Wry>,
    note_id: String,
    source_path: Option<String>, // Path from file or image blob
    image_data: Option<Vec<u8>>, // Optional binary data for pasted images
) -> Result<String, String> {
    let attachments_dir = get_attachments_dir(&app_handle, &note_id);

    // Set up a unique filename with timestamp
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let file_name = format!("{}_image.png", timestamp);
    let dest_path = attachments_dir.join(&file_name);

    if let Some(data) = image_data {
        // Save the image data directly if provided
        std::fs::write(dest_path.clone(), data).map_err(|e| e.to_string())?;
    } else if let Some(path) = source_path {
        let source_path = PathBuf::from(path);
        std::fs::copy(source_path, dest_path.clone()).map_err(|e| e.to_string())?;
    } else {
        return Err("No valid image source provided".to_string());
    }

    Ok(file_name) // Return the saved filename
}

#[tauri::command]
async fn save_clipboard_image(
    app_handle: AppHandle,
    note_id: String,
    file_name: String,
    image_data: Vec<u8>,
) -> Result<String, String> {
    let attachment_dir = get_attachments_dir(&app_handle, &note_id);
    let file_path = attachment_dir.join(&file_name);

    File::create(&file_path)
        .and_then(|mut file| file.write_all(&image_data))
        .map_err(|e| e.to_string())?;

    Ok(file_name)
}

#[tauri::command]
async fn serve_attachment(
    app: tauri::AppHandle,
    note_id: String,
    file_name: String,
) -> Result<Vec<u8>, String> {
    let attachment_path = get_attachments_dir(&app, &note_id).join(&file_name);

    if !attachment_path.exists() {
        return Err("File not found".into());
    }

    fs::read(&attachment_path).map_err(|e| e.to_string())
}

// Network discovery functions
#[tauri::command]
async fn get_peers(app_handle: AppHandle<Wry>) -> Result<Vec<PeerDevice>, String> {
    let state = app_handle.state::<Arc<Mutex<AppState>>>();
    let app_state = state.lock().map_err(|e| e.to_string())?;

    Ok(app_state.peers.values().cloned().collect())
}

#[tauri::command]
async fn share_note(
    app_handle: AppHandle<Wry>,
    note_id: String,
    peer_id: String,
) -> Result<(), String> {
    let state = app_handle.state::<Arc<Mutex<AppState>>>();

    // Get the peer device - we need to drop the mutex guard before await
    let peer = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        app_state
            .peers
            .get(&peer_id)
            .cloned()
            .ok_or("Peer not found")?
    };

    // Find the note
    let notes = get_notes(app_handle.clone()).await?;
    let note = notes
        .iter()
        .find(|n| n.id == note_id)
        .ok_or("Note not found")?;

    // Read attachments data
    let mut attachments_data = HashMap::new();
    let attachments_dir = get_attachments_dir(&app_handle, &note_id);

    for attachment_name in &note.attachments {
        let attachment_path = attachments_dir.join(attachment_name);
        if attachment_path.exists() {
            if let Ok(data) = fs::read(&attachment_path) {
                attachments_data.insert(attachment_name.clone(), data);
            }
        }
    }

    // Get device info including name
    let (device_id, device_name) = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        (app_state.device_id.clone(), app_state.device_name.clone())
    };

    // Create the sync request
    let sync_request = SyncRequest {
        peer_id: device_id,
        peer_name: device_name,  // Use our local device name
        note: note.clone(),
        attachments_data,
    };

    // Send the sync request to the peer
    let client = reqwest::Client::new();
    let url = format!("http://{}:{}/sync/request", peer.ip, peer.port);

    tokio::spawn(async move {
        let result = client
            .post(&url)
            .json(&sync_request)
            .timeout(Duration::from_secs(5))
            .send()
            .await;

        if let Err(e) = result {
            println!("Failed to send sync request: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
async fn share_notes(
    app_handle: AppHandle<Wry>,
    note_ids: Vec<String>,
    peer_id: String,
) -> Result<(), String> {
    println!("Sharing {} notes with peer {}", note_ids.len(), peer_id);
    
    let state = app_handle.state::<Arc<Mutex<AppState>>>();

    // Get the peer device - we need to drop the mutex guard before await
    let peer = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        app_state
            .peers
            .get(&peer_id)
            .cloned()
            .ok_or("Peer not found")?
    };
    
    println!("Found peer: {} at {}:{}", peer.name, peer.ip, peer.port);

    // Get device info
    let (device_id, device_name) = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        (app_state.device_id.clone(), app_state.device_name.clone())
    };

    // Find the notes
    let all_notes = get_notes(app_handle.clone()).await?;
    let client = reqwest::Client::new();
    let url = format!("http://{}:{}/sync/request", peer.ip, peer.port);
    
    println!("Will send requests to URL: {}", url);
    println!("Our device: {} ({})", device_name, device_id);

    // Process each note
    for note_id in note_ids {
        println!("Processing note: {}", note_id);
        
        // Find this specific note
        let note = match all_notes.iter().find(|n| n.id == note_id) {
            Some(n) => n.clone(),
            None => {
                println!("Note not found: {}", note_id);
                continue; // Skip if not found
            }
        };

        // Read attachments data
        let mut attachments_data = HashMap::new();
        let attachments_dir = get_attachments_dir(&app_handle, &note_id);

        for attachment_name in &note.attachments {
            let attachment_path = attachments_dir.join(attachment_name);
            if attachment_path.exists() {
                if let Ok(data) = fs::read(&attachment_path) {
                    attachments_data.insert(attachment_name.clone(), data.clone());
                    println!("Added attachment: {}, size: {} bytes", attachment_name, data.len());
                }
            }
        }

        // Create the sync request with correct device info
        let sync_request = SyncRequest {
            peer_id: device_id.clone(),
            peer_name: device_name.clone(),  // Our own device name, not peer.name
            note: note.clone(),
            attachments_data,
        };

        // Send the sync request to the peer - create a new client with custom settings for each request
        // to avoid payload size issues
        let url_clone = url.clone();

        tokio::spawn(async move {
            println!("Sending sync request for note: {}", note.id);

            // Create a custom client with larger limits
            let custom_client = reqwest::Client::builder()
                .pool_max_idle_per_host(0) // Don't reuse connections
                .tcp_keepalive(None) // Disable keepalive
                .tcp_nodelay(true) // Prioritize low latency
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());

            // Use a longer timeout for larger payloads
            let result = custom_client
                .post(&url_clone)
                .json(&sync_request)
                .timeout(Duration::from_secs(60)) // Increase timeout to 60 seconds
                .send()
                .await;

            match result {
                Ok(response) => {
                    println!(
                        "Sync request sent successfully for note: {}, status: {}",
                        note.id,
                        response.status()
                    );
                    if let Ok(text) = response.text().await {
                        println!("Response body: {}", text);
                    }
                }
                Err(e) => {
                    println!("Failed to send sync request for note {}: {}", note.id, e);
                }
            }
        });
    }

    Ok(())
}

#[tauri::command]
async fn get_sync_notifications(
    app_handle: AppHandle<Wry>,
) -> Result<Vec<SyncNotification>, String> {
    let state = app_handle.state::<Arc<Mutex<AppState>>>();
    let app_state = state.lock().map_err(|e| e.to_string())?;

    Ok(app_state.sync_notifications.clone())
}

#[tauri::command]
async fn respond_to_sync(
    app_handle: AppHandle<Wry>,
    notification_id: String,
    accept: bool,
) -> Result<(), String> {
    let state = app_handle.state::<Arc<Mutex<AppState>>>();

    // Extract needed data and release mutex before await
    let (peer, note_id, _notification_status) = {
        let mut app_state = state.lock().map_err(|e| e.to_string())?;

        // Find the notification
        let notification_index = app_state
            .sync_notifications
            .iter()
            .position(|n| n.id == notification_id)
            .ok_or("Notification not found")?;

        let notification = &mut app_state.sync_notifications[notification_index];
        let peer = notification.from_peer.clone();

        // Get the note ID from the temporary sync file
        let notes_dir = get_notes_dir(&app_handle);
        let mut note_id = String::new();

        for entry in fs::read_dir(notes_dir).map_err(|e| e.to_string())? {
            if let Ok(entry) = entry {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "sync" {
                        if let Some(stem) = path.file_stem() {
                            if let Some(stem_str) = stem.to_str() {
                                note_id = stem_str.to_string();
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Update the notification status
        notification.status = if accept {
            SyncStatus::Accepted
        } else {
            SyncStatus::Rejected
        };

        (peer, note_id, notification.status.clone())
    };

    // Handle the sync file based on accept/reject decision
    if accept && !note_id.is_empty() {
        // Move the temporary .sync file to a regular note file
        let notes_dir = get_notes_dir(&app_handle);
        let sync_path = notes_dir.join(format!("{}.sync", note_id));
        let note_path = notes_dir.join(format!("{}.md", note_id));

        if sync_path.exists() {
            if let Err(e) = fs::rename(&sync_path, &note_path) {
                println!("Failed to rename sync file: {}", e);
                // Try copy instead of rename
                if let Ok(content) = fs::read_to_string(&sync_path) {
                    let _ = fs::write(&note_path, content);
                    let _ = fs::remove_file(&sync_path);
                }
            }
        }

        // The attachments should already be in place from when we received the sync request

        // Notify frontend to refresh notes
        app_handle
            .emit("notes-updated", ())
            .map_err(|e| e.to_string())?;
    } else if !note_id.is_empty() {
        // Delete the temporary file and attachments if rejected
        let notes_dir = get_notes_dir(&app_handle);
        let sync_path = notes_dir.join(format!("{}.sync", note_id));
        if sync_path.exists() {
            let _ = fs::remove_file(sync_path);
        }

        // Also consider cleaning up any attachments that were pre-saved
        let attachments_dir = get_attachments_dir(&app_handle, &note_id);
        if attachments_dir.exists() {
            let _ = fs::remove_dir_all(attachments_dir);
        }
    }

    // Notify the peer about the response
    let client = reqwest::Client::new();
    let url = format!("http://{}:{}/sync/response", peer.ip, peer.port);

    let response = serde_json::json!({
        "notification_id": notification_id,
        "accepted": accept
    });

    tokio::spawn(async move {
        let result = client
            .post(&url)
            .json(&response)
            .timeout(Duration::from_secs(5))
            .send()
            .await;

        if let Err(e) = result {
            println!("Failed to send sync response: {}", e);
        }
    });

    Ok(())
}

#[tauri::command]
async fn open_notes_dir(app_handle: AppHandle<Wry>) -> Result<(), String> {
    let path = get_notes_dir(&app_handle);

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("explorer")
            .args([path.to_str().unwrap()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open")
            .args([path.to_str().unwrap()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        use std::process::Command;
        Command::new("xdg-open")
            .args([path.to_str().unwrap()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn main() {
    // Generate a unique device ID and name
    let device_id = uuid::Uuid::new_v4().to_string();
    let device_name = hostname::get()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|_| "Unknown Device".to_string());

    // Initialize app state
    let app_state = Arc::new(Mutex::new(AppState {
        device_id,
        device_name,
        peers: HashMap::new(),
        sync_notifications: Vec::new(),
    }));

    // Create builder and manage state
    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_notes,
            save_note,
            delete_note,
            save_attachment,
            save_clipboard_image,
            serve_attachment,
            get_peers,
            share_note,
            share_notes,
            get_sync_notifications,
            respond_to_sync,
            open_notes_dir
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Spawn a separate thread for networking
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new().unwrap();
                rt.block_on(async {
                    // Try to bind to a port
                    let mut bound_listener = None;
                    let mut bound_port = 0;
                    let mut bound_ip = IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);

                    // Try different ports
                    for port in 8000..8020 {
                        // Try to get the local IP address - with fallback options for macOS
                        let mut attempted_local_ip = false;
                        
                        if let Ok(local_ip) = local_ip() {
                            attempted_local_ip = true;
                            let addr = SocketAddr::new(local_ip, port);
                            if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
                                bound_listener = Some(listener);
                                bound_port = port;
                                bound_ip = local_ip;
                                break;
                            }
                        }
                        
                        // If local_ip failed or couldn't bind, try with explicit IP addresses
                        if !attempted_local_ip || bound_listener.is_none() {
                            // Try with IPv4 loopback first
                            let addr = SocketAddr::new(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST), port);
                            if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
                                bound_listener = Some(listener);
                                bound_port = port;
                                bound_ip = IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);
                                break;
                            }
                            
                            // Try with 0.0.0.0 (bind to all interfaces)
                            let addr = SocketAddr::new(IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0)), port);
                            if let Ok(listener) = tokio::net::TcpListener::bind(addr).await {
                                bound_listener = Some(listener);
                                bound_port = port;
                                // Use 127.0.0.1 for services even though bound to 0.0.0.0
                                bound_ip = IpAddr::V4(std::net::Ipv4Addr::LOCALHOST);
                                break;
                            }
                        }
                    }

                    // Check if binding succeeded
                    if bound_listener.is_none() {
                        println!("Failed to bind to any port");
                        return;
                    }

                    let listener = bound_listener.unwrap();
                    println!("HTTP server listening on {}:{}", bound_ip, bound_port);

                    // Clone the device ID and name for mDNS
                    let device_id;
                    let device_name;

                    // Properly scoped to avoid temporary value issues
                    {
                        let state_arc = app_handle.state::<Arc<Mutex<AppState>>>();
                        let guard = match state_arc.lock() {
                            Ok(guard) => guard,
                            Err(_) => {
                                println!("Failed to lock app state");
                                return;
                            }
                        };
                        device_id = guard.device_id.clone();
                        device_name = guard.device_name.clone();
                    }

                    // Start HTTP server and create two separate handles for the router
                    let request_handle = app_handle.clone();
                    let response_handle = app_handle.clone();

                    tokio::spawn(async move {
                        // Set up the HTTP server using axum with increased limits
                        let router = axum::Router::new()
                            .route(
                                "/sync/request",
                                axum::routing::post(
                                    move |req: axum::extract::Json<SyncRequest>| {
                                        let app = request_handle.clone();
                                        async move {
                                            let sync_request = req.0;
                                            println!(
                                                "Received sync request from peer: {}",
                                                sync_request.peer_id
                                            );

                                            // Properly scope the state access
                                            let peer;
                                            let notification_id;
                                            let note_title;

                                            {
                                                let state_arc = app.state::<Arc<Mutex<AppState>>>();
                                                let mut guard = match state_arc.lock() {
                                                    Ok(guard) => guard,
                                                    Err(_) => {
                                                        println!("Failed to lock app state");
                                                        return axum::Json(serde_json::json!({
                                                            "success": false,
                                                            "error": "Failed to lock app state"
                                                        }));
                                                    }
                                                };

                                                // When sharing notes, we don't require the peer to be in the peers list
                                                // Instead, we'll use the peer_id from the sync request
                                                let peer_info = guard.peers.get(&sync_request.peer_id);
                                                
                                                if let Some(p) = peer_info {
                                                    println!("Found peer in peers list: {}", p.name);
                                                    peer = p.clone();
                                                } else {
                                                    println!("Peer not in peers list, creating temporary peer entry");
                                                    // Create a temporary peer device entry
                                                    peer = PeerDevice {
                                                        id: sync_request.peer_id.clone(),
                                                        name: sync_request.peer_name.clone(), // Use the name from the request
                                                        ip: std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
                                                        port: 0, // We don't know the port
                                                    };
                                                }

                                                // Create notification
                                                notification_id = uuid::Uuid::new_v4().to_string();
                                                note_title = sync_request.note.title.clone();

                                                println!("Creating notification: {} for note: {}", notification_id, note_title);

                                                // Store the notification
                                                guard.sync_notifications.push(SyncNotification {
                                                    id: notification_id.clone(),
                                                    from_peer: peer.clone(),
                                                    note_title: note_title.clone(),
                                                    status: SyncStatus::Pending,
                                                });
                                                
                                                println!("Current notifications count: {}", guard.sync_notifications.len());
                                            }

                                            // Store the note temporarily
                                            let path = get_note_path(&app, &sync_request.note.id);
                                            if let Some(path_str) = path.to_str() {
                                                let note = sync_request.note.clone();
                                                let note_content =
                                                    format!("# {}\n\n{}", note.title, note.content);
                                                let sync_path = format!("{}.sync", path_str);
                                                println!("Writing sync file to: {}", sync_path);

                                                if let Err(e) = fs::write(&sync_path, note_content)
                                                {
                                                    println!("Failed to write sync file: {}", e);
                                                } else {
                                                    println!("Successfully wrote sync file");
                                                }

                                                // Save any attachment files that were included
                                                for (file_name, file_data) in
                                                    &sync_request.attachments_data
                                                {
                                                    let attachments_dir =
                                                        get_attachments_dir(&app, &note.id);
                                                    let attachment_path =
                                                        attachments_dir.join(file_name);
                                                    println!(
                                                        "Saving attachment: {} to path: {:?}",
                                                        file_name, attachment_path
                                                    );

                                                    if let Err(e) =
                                                        fs::write(&attachment_path, file_data)
                                                    {
                                                        println!(
                                                            "Failed to write attachment file: {}",
                                                            e
                                                        );
                                                    } else {
                                                        println!(
                                                            "Successfully wrote attachment file"
                                                        );
                                                    }
                                                }
                                            }

                                            // Notify the frontend
                                            println!(
                                                "Emitting sync-notification event to frontend"
                                            );
                                            match app.emit("sync-notification", ()) {
                                                Ok(_) => println!(
                                                    "Successfully emitted sync-notification event"
                                                ),
                                                Err(e) => println!(
                                                    "Failed to emit sync-notification event: {}",
                                                    e
                                                ),
                                            }

                                            // Return success
                                            axum::Json(serde_json::json!({ "success": true }))
                                        }
                                    },
                                ),
                            )
                            .route(
                                "/sync/response",
                                axum::routing::post(
                                    move |req: axum::extract::Json<serde_json::Value>| {
                                        let app_handle = response_handle.clone();
                                        async move {
                                            let response = req.0;

                                            let notification_id =
                                                response["notification_id"].as_str().unwrap_or("");
                                            let accepted =
                                                response["accepted"].as_bool().unwrap_or(false);

                                            // Notify the frontend
                                            let _ = app_handle.emit(
                                                "sync-response",
                                                serde_json::json!({
                                                    "notification_id": notification_id,
                                                    "accepted": accepted,
                                                }),
                                            );

                                            // Return success
                                            axum::Json(serde_json::json!({ "success": true }))
                                        }
                                    },
                                ),
                            );

                        // Configure the router with proper limits for large attachments
                        let app = router.layer(
                            tower::ServiceBuilder::new()
                                .layer(axum::extract::DefaultBodyLimit::max(50 * 1024 * 1024)), // 50 MB limit
                        );

                        if let Err(e) = axum::serve(listener, app).await {
                            println!("HTTP server error: {}", e);
                        }
                    });

                    // Try to set up mDNS service with the bound port
                    let mdns = match ServiceDaemon::new() {
                        Ok(daemon) => daemon,
                        Err(e) => {
                            println!("Failed to create mDNS daemon: {}", e);
                            return;
                        }
                    };

                    // Convert IP to IPv4 for mDNS
                    let ipv4_addr = match bound_ip {
                        IpAddr::V4(addr) => addr,
                        IpAddr::V6(_) => {
                            println!("IPv6 not supported for mDNS");
                            return;
                        }
                    };

                    // Create service info
                    let service_type = "_notes-sync._tcp.local.";
                    let instance_name = format!("{}_{}", device_name, device_id);

                    let properties = HashMap::from([
                        ("id".into(), device_id.clone().into()),
                        ("name".into(), device_name.clone().into()),
                    ]);

                    let service_info = match ServiceInfo::new(
                        service_type,
                        &instance_name,
                        "local.", // Use a fixed domain name instead of hostname-based one
                        ipv4_addr,
                        bound_port,
                        Some(properties),
                    ) {
                        Ok(info) => info,
                        Err(e) => {
                            println!("Failed to create mDNS service info: {}", e);
                            return;
                        }
                    };

                    // Register service
                    if let Err(e) = mdns.register(service_info) {
                        println!("Failed to register mDNS service: {}", e);
                        return;
                    }

                    println!("mDNS service registered successfully");

                    // Browse for other services
                    let browser = match mdns.browse(service_type) {
                        Ok(browser) => browser,
                        Err(e) => {
                            println!("Failed to browse mDNS: {}", e);
                            return;
                        }
                    };

                    // Store device_id for comparing in the mDNS events
                    let device_id_for_compare = device_id.clone();
                    let app_handle_for_events = app_handle.clone();

                    // Handle mDNS events
                    loop {
                        match browser.recv() {
                            Ok(ServiceEvent::ServiceResolved(info)) => {
                                // Skip our own service
                                if let Some(peer_id) =
                                    info.get_property("id").and_then(|id| id.to_string().into())
                                {
                                    if peer_id == device_id_for_compare {
                                        continue;
                                    }

                                    let peer_name = info
                                        .get_property("name")
                                        .and_then(|name| name.to_string().into())
                                        .unwrap_or_else(|| "Unknown".to_string());

                                    // Get IP address
                                    if let Some(addr) = info.get_addresses().iter().next() {
                                        let peer = PeerDevice {
                                            id: peer_id.clone(),
                                            name: peer_name,
                                            ip: IpAddr::V4(*addr),
                                            port: info.get_port(),
                                        };

                                        // Get a copy of state to update
                                        let app_state =
                                            app_handle_for_events.state::<Arc<Mutex<AppState>>>();

                                        // Add the peer
                                        {
                                            if let Ok(mut state) = app_state.lock() {
                                                state.peers.insert(peer_id, peer);
                                            }
                                        }

                                        // Notify frontend - outside of lock scope
                                        let _ = app_handle_for_events.emit("peers-updated", ());
                                    }
                                }
                            }
                            Ok(ServiceEvent::ServiceRemoved(_service_type, instance_name)) => {
                                // Extract the ID from the instance name
                                if let Some(id_part) = instance_name.split('_').last() {
                                    let peer_id = id_part.to_string();
                                    let removed;

                                    // Get a copy of state to update
                                    let app_state =
                                        app_handle_for_events.state::<Arc<Mutex<AppState>>>();

                                    // Remove the peer
                                    {
                                        if let Ok(mut state) = app_state.lock() {
                                            removed = state.peers.remove(&peer_id).is_some();
                                        } else {
                                            removed = false;
                                        }
                                    }

                                    // Notify frontend if needed - outside of lock scope
                                    if removed {
                                        let _ = app_handle_for_events.emit("peers-updated", ());
                                    }
                                }
                            }
                            Ok(_) => { /* Ignore other events */ }
                            Err(e) => {
                                println!("Error receiving mDNS event: {:?}", e);
                                break;
                            }
                        }
                    }
                });
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, _event| {})
}
