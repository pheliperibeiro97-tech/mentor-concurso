// Mentor Concurso — backend Tauri.
// Para o MVP, a persistência usa SQLite como armazenamento chave/valor:
// o estado completo do app é um documento JSON gerenciado no frontend e
// gravado/lido aqui. A normalização em tabelas próprias fica para v2.

use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};

struct Db(Mutex<Connection>);

fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )?;
    Ok(())
}

#[tauri::command]
fn load_state(db: State<Db>) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv WHERE key = 'state'")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let value: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(value))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn save_state(json: String, db: State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kv (key, value) VALUES ('state', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ===== Licenciamento (anti-repasse, Opção A) =====
// O ID da máquina identifica de forma estável esta instalação. A licença
// (chave + validade + assinatura) é guardada na mesma tabela kv, separada do
// estado do app, para sobreviver a um "apagar todos os dados".

#[tauri::command]
fn get_machine_id() -> Result<String, String> {
    machine_uid::get().map_err(|e| e.to_string())
}

// Encerra o app INTEIRO (janela principal + a janelinha flutuante do cronômetro). Sem isto,
// fechar a principal deixa o app vivo enquanto o cronômetro flutuante estiver aberto (o Tauri
// só sai quando todas as janelas fecham). O front chama isto ao fechar, após sincronizar.
#[tauri::command]
fn sair_do_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_license(db: State<Db>) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT value FROM kv WHERE key = 'license'")
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let value: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(value))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn set_license(json: String, db: State<Db>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO kv (key, value) VALUES ('license', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ===== Claude Code local (uso pessoal · desktop) =====
// Roda o Claude Code em modo headless (`claude -p ... --output-format json`) e devolve o
// stdout (JSON com campo `.result`) para o frontend parsear. Para OCR/visão, grava a imagem
// num arquivo temporário e referencia no prompt (Claude lê com a ferramenta Read).
// Usa a autenticação local do Claude Code (assinatura do dono) — só funciona na máquina dele,
// não é distribuído. O subprocesso (que pode levar dezenas de segundos) roda numa thread
// bloqueante para não travar a UI.
#[tauri::command]
async fn claude_prompt(
    prompt: String,
    model: Option<String>,
    image_b64: Option<String>,
    image_mime: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        use base64::Engine;
        use std::process::Command;

        let mut prompt_final = prompt;
        let mut temp_file: Option<std::path::PathBuf> = None;
        let mut extra_args: Vec<String> = Vec::new();

        if let Some(b64) = image_b64 {
            if !b64.trim().is_empty() {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(b64.trim())
                    .map_err(|e| format!("imagem base64 inválida: {}", e))?;
                let ext = match image_mime.as_deref() {
                    Some("application/pdf") => "pdf",
                    Some(m) if m.contains("jpeg") || m.contains("jpg") => "jpg",
                    Some(m) if m.contains("webp") => "webp",
                    _ => "png",
                };
                let fname = format!("mentor_claude_{}_{}.{}", std::process::id(), now_millis(), ext);
                let path = std::env::temp_dir().join(fname);
                std::fs::write(&path, &bytes)
                    .map_err(|e| format!("falha ao gravar arquivo temporário: {}", e))?;
                prompt_final = format!(
                    "{}\n\nO arquivo a analisar está em: {}\nLeia esse arquivo e responda conforme pedido.",
                    prompt_final,
                    path.display()
                );
                // Permite a ferramenta Read sem prompt de permissão (modo headless).
                extra_args.push("--allowedTools".into());
                extra_args.push("Read".into());
                temp_file = Some(path);
            }
        }

        let mut cmd = Command::new("claude");
        cmd.arg("-p")
            .arg(&prompt_final)
            .arg("--output-format")
            .arg("json");
        if let Some(m) = model {
            if !m.trim().is_empty() {
                cmd.arg("--model").arg(m.trim());
            }
        }
        for a in &extra_args {
            cmd.arg(a);
        }
        // cwd = temp dir (evita herdar um diretório com muitos arquivos do projeto).
        cmd.current_dir(std::env::temp_dir());

        let out = cmd.output();
        if let Some(p) = temp_file {
            let _ = std::fs::remove_file(p);
        }
        let out = out.map_err(|e| {
            format!(
                "não consegui executar 'claude' (o Claude Code está instalado e no PATH?): {}",
                e
            )
        })?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!(
                "claude retornou erro: {}",
                err.chars().take(500).collect::<String>()
            ));
        }
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    })
    .await
    .map_err(|e| format!("falha interna ao rodar o Claude: {}", e))?
}

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

// Salva bytes (base64) num arquivo escolhido pelo usuário na CAIXA DE SALVAR NATIVA.
// Usa std::fs direto (sem plugin-fs), então não depende de escopo. Retorna o caminho salvo,
// ou None se o usuário cancelar. Usado pelo "Baixar PNG" do mapa mental (e reaproveitável).
#[tauri::command]
async fn save_bytes(app: tauri::AppHandle, name: String, data: String) -> Result<Option<String>, String> {
    use base64::Engine;
    use tauri_plugin_dialog::DialogExt;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data.as_bytes())
        .map_err(|e| format!("base64 inválido: {}", e))?;
    match app.dialog().file().set_file_name(&name).blocking_save_file() {
        Some(fp) => {
            let path = fp.into_path().map_err(|e| e.to_string())?;
            std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_data_dir()
                .expect("não foi possível resolver app_data_dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = Connection::open(dir.join("mentor_concurso.db"))
                .expect("falha ao abrir o banco SQLite");
            init_db(&conn).expect("falha ao inicializar o banco");
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            get_machine_id,
            get_license,
            set_license,
            sair_do_app,
            claude_prompt,
            save_bytes
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o Mentor Concurso");
}
