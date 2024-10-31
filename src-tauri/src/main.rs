#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::{self,File};
use std::io::Write;
use std::path::PathBuf;
use tauri::{Manager, Wry, AppHandle};

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Note {
    id: String,
    title: String,
    content: String,
    datetime: String,
    attachments: Vec<String>,
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
                let title = lines.next()
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
                    datetime: entry.metadata()
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
    image_data: Option<Vec<u8>>,  // Optional binary data for pasted images
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
async fn save_clipboard_image(app_handle: AppHandle, note_id: String, file_name: String, image_data: Vec<u8>) -> Result<String, String> {
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


fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_notes,
            save_note,
            delete_note,
            save_attachment,
            save_clipboard_image,
            serve_attachment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
