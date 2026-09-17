import json
import os
import subprocess
import time
import threading
import ctypes
from pathlib import Path
from urllib.parse import quote

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ================================================================
# CONFIGURAÇÃO
# ================================================================
# Você pode sobrescrever o diretório por variável de ambiente:
#   set UIVISION_HOME=C:\Users\maykon.moraes\Desktop\uivision
USUARIO_WINDOWS = os.environ.get("UIVISION_USER", "maykon.moraes")
PASTA_BASE = Path(
    os.environ.get(
        "UIVISION_HOME",
        rf"C:\Users\{USUARIO_WINDOWS}\Desktop\uivision",
    )
).expanduser()
PASTA_MACROS = PASTA_BASE / "macros"
PASTA_DATASOURCES = PASTA_BASE / "datasources"
HTML_API = PASTA_BASE / "ui.vision.html"

CSV_ATIVACAO_PATH = PASTA_DATASOURCES / "lista_ativacao.csv"
CSV_SOC_PATH = PASTA_DATASOURCES / "colaboradores.csv"
RESULTADOS_SOC_PATH = PASTA_DATASOURCES / "resultados_extracao.json"

BROWSER_PREFERENCE = os.environ.get("UIVISION_BROWSER", "auto").strip().lower()

# Nome mostrado no painel -> arquivo real dentro de /macros.
# Para o JS script macro do Ui.Vision 10, mantemos .js explicitamente.
MACROS_CONFIG = {
    "TESTE_SESI": {"filename": "TESTE_SESI.js", "aliases": ["TESTE_SESI"]},
    "PREENCHER_FC_SESI": {"filename": "PREENCHER_FC_SESI.js", "aliases": ["PREENCHER_FC_SESI"]},
    "SOC - CRIAR CADASTRO": {
        "filename": "SOC - CRIAR CADASTRO.js",
        "aliases": ["SOC - CRIAR CADASTRO", "SOC - CRIAR CADASTRO.js"],
    },
    "ATIVAR_FUNCIONARIOS": {
        "filename": "ATIVAR_FUNCIONARIOS.js",
        "aliases": ["ATIVAR_FUNCIONARIOS", "ATIVAR_FUNCIONARIOS.js"],
    },
}

# Compatibilidade com o código existente do painel.
MACRO_ATIVACAO = "ATIVAR_FUNCIONARIOS"
MACRO_SOC = "SOC - CRIAR CADASTRO"
MACROS_PERMITIDAS = set(MACROS_CONFIG.keys())


# ================================================================
# LOCALIZAÇÃO DO NAVEGADOR
# ================================================================
def candidatos_navegadores():
    local = os.environ.get(
        "LOCALAPPDATA", rf"C:\Users\{USUARIO_WINDOWS}\AppData\Local"
    )
    pf = os.environ.get("PROGRAMFILES", r"C:\Program Files")
    pfx86 = os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")

    return {
        "chrome": [
            Path(pf) / "Google/Chrome/Application/chrome.exe",
            Path(pfx86) / "Google/Chrome/Application/chrome.exe",
            Path(local) / "Google/Chrome/Application/chrome.exe",
        ],
        "edge": [
            Path(pf) / "Microsoft/Edge/Application/msedge.exe",
            Path(pfx86) / "Microsoft/Edge/Application/msedge.exe",
            Path(local) / "Microsoft/Edge/Application/msedge.exe",
        ],
        "opera": [
            Path(local) / "Programs/Opera/launcher.exe",
            Path(local) / "Programs/Opera GX/launcher.exe",
            Path(pf) / "Opera/launcher.exe",
        ],
    }


def navegador_em_uso_windows():
    try:
        result = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            encoding="cp1252",
            errors="replace",
            timeout=5,
        )
        processos = result.stdout.lower()
        if "opera.exe" in processos or "opera gx.exe" in processos:
            return "opera"
        if "msedge.exe" in processos:
            return "edge"
        if "chrome.exe" in processos:
            return "chrome"
    except Exception:
        pass
    return None


def localizar_navegador():
    candidatos = candidatos_navegadores()
    ordem = []

    if BROWSER_PREFERENCE in candidatos:
        ordem.append(BROWSER_PREFERENCE)
    elif BROWSER_PREFERENCE == "auto":
        detectado = navegador_em_uso_windows()
        if detectado:
            ordem.append(detectado)

    for nome in ("chrome", "edge", "opera"):
        if nome not in ordem:
            ordem.append(nome)

    # where.exe também ajuda quando o navegador foi instalado em um caminho
    # diferente do padrão.
    for nome, executavel in (
        ("chrome", "chrome.exe"),
        ("edge", "msedge.exe"),
        ("opera", "launcher.exe"),
    ):
        if nome not in ordem:
            ordem.append(nome)
        try:
            result = subprocess.run(
                ["where", executavel],
                capture_output=True,
                text=True,
                encoding="cp850",
                errors="replace",
                timeout=3,
            )
            for line in result.stdout.splitlines():
                c = Path(line.strip().strip('"'))
                if c.is_file():
                    candidatos.setdefault(nome, []).append(c)
        except Exception:
            pass

    for nome in ordem:
        for caminho in candidatos.get(nome, []):
            if caminho.is_file():
                return nome, caminho

    return None, None


# ================================================================
# UTILITÁRIOS UI.VISION
# ================================================================
def normalizar_nome_macro(nome):
    nome = str(nome or "").strip()
    return nome


def localizar_arquivo_macro(nome_macro):
    nome = normalizar_nome_macro(nome_macro)
    config = MACROS_CONFIG.get(nome)
    if config:
        candidatos = [PASTA_MACROS / config["filename"]]
        # Compatibilidade caso a macro tenha sido mantida como .json.
        if config["filename"].endswith(".js"):
            candidatos.append(PASTA_MACROS / config["filename"].replace(".js", ".json"))
    else:
        # Para macros adicionais, aceita nome do arquivo informado diretamente.
        base = nome[:-3] if nome.lower().endswith(".js") else nome
        candidatos = [
            PASTA_MACROS / f"{base}.js",
            PASTA_MACROS / f"{base}.json",
        ]

    for caminho in candidatos:
        if caminho.is_file():
            return caminho

    # Permite encontrar em subpastas sem exigir que o usuário reorganize macros.
    if PASTA_MACROS.exists():
        for caminho in PASTA_MACROS.rglob("*"):
            if not caminho.is_file():
                continue
            if caminho.name.lower() in {
                (config["filename"] if config else f"{nome}.js").lower(),
                (config["filename"].replace(".js", ".json") if config and config["filename"].endswith(".js") else f"{nome}.json").lower(),
            }:
                return caminho

    return None


def nome_query_macro(nome_macro, arquivo_macro):
    """Retorna o valor exato a enviar em macro=.

    Em macros JS modernas, usar explicitamente o nome do arquivo .js evita
    ambiguidades entre macro de tabela e JS script macro em versões atuais.
    """
    if arquivo_macro.suffix.lower() == ".js":
        return arquivo_macro.stem + ".js"
    return arquivo_macro.stem


def construir_url_macro(nome_macro, arquivo_macro, log_name=None, incluir_extensao=True, run_id=None, soc_ids=None):
    macro_query = nome_query_macro(nome_macro, arquivo_macro)
    url_html = HTML_API.as_uri()
    params = [
        f"macro={quote(macro_query, safe='/')}",
        "direct=1",
        "storage=xfile",
        "closeRPA=1",
        "closeBrowser=0",
        "bringToFront=0"  # <--- ADICIONE ESTA LINHA: Impede o UI.Vision de pular para a frente
    ]
    if run_id:
        params.append(f"cmd_var1={quote(run_id)}")
    if soc_ids:
        params.append(f"cmd_var2={quote(soc_ids)}")
    if log_name:
        log = str(log_name).replace("\\", "/")
        params.append(f"savelog={quote(log, safe='/:')}")
    return url_html + "?" + "&".join(params)


def listar_macros():
    if not PASTA_MACROS.exists():
        return []
    result = []
    for item in sorted(PASTA_MACROS.rglob("*")):
        if item.is_file() and item.suffix.lower() in (".js", ".json"):
            result.append(str(item.relative_to(PASTA_MACROS)).replace("\\", "/"))
    return result


def diagnostico_ambiente():
    browser_name, browser_path = localizar_navegador()
    macro_soc = localizar_arquivo_macro(MACRO_SOC)
    macro_ativacao = localizar_arquivo_macro(MACRO_ATIVACAO)
    issues = []

    if not PASTA_BASE.exists():
        issues.append(f"Pasta Ui.Vision não existe: {PASTA_BASE}")
    if not PASTA_MACROS.exists():
        issues.append(f"Pasta de macros não existe: {PASTA_MACROS}")
    if not HTML_API.exists():
        issues.append(f"ui.vision.html não localizado: {HTML_API}")
    if not browser_path:
        issues.append("Chrome/Edge/Opera não localizado no computador.")
    if not macro_soc:
        issues.append(
            'Macro "SOC - CRIAR CADASTRO.js" não encontrada em '
            f"{PASTA_MACROS}"
        )
    if not macro_ativacao:
        issues.append(
            'Macro "ATIVAR_FUNCIONARIOS.js" não encontrada em '
            f"{PASTA_MACROS}"
        )
    if not PASTA_DATASOURCES.exists():
        # Não é erro: o bridge cria a pasta na primeira execução.
        pass

    return {
        "pasta_base": str(PASTA_BASE),
        "pasta_macros": str(PASTA_MACROS),
        "pasta_datasources": str(PASTA_DATASOURCES),
        "ui_vision_html": str(HTML_API),
        "ui_vision_html_existe": HTML_API.exists(),
        "browser": browser_name,
        "browser_path": str(browser_path) if browser_path else None,
        "macro_soc": str(macro_soc) if macro_soc else None,
        "macro_ativacao": str(macro_ativacao) if macro_ativacao else None,
        "macro_soc_query": nome_query_macro(MACRO_SOC, macro_soc) if macro_soc else None,
        "macros": listar_macros(),
        "issues": issues,
        "ok": not issues,
    }


def aguardar_log(log_path, timeout=4.0):
    """Lê um log curto pós-lançamento para capturar erro imediato de macro inexistente."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if log_path.is_file() and log_path.stat().st_size > 0:
            try:
                text = log_path.read_text(encoding="utf-8", errors="replace")
            except Exception:
                text = ""
            return text
        time.sleep(0.2)
    return ""


def disparar_macro(nome_macro, run_id=None, soc_ids=None):
    nome_macro = normalizar_nome_macro(nome_macro)
    if nome_macro not in MACROS_PERMITIDAS:
        raise ValueError(f'Macro não permitida ou não cadastrada: {nome_macro or "vazio"}')

    if not PASTA_BASE.exists():
        raise FileNotFoundError(f"Pasta Ui.Vision não encontrada: {PASTA_BASE}")
    if not PASTA_MACROS.exists():
        raise FileNotFoundError(f"Pasta de macros não encontrada: {PASTA_MACROS}")
    if not HTML_API.exists():
        raise FileNotFoundError(
            f"ui.vision.html não localizado em: {HTML_API}. "
            "Abra o Ui.Vision > Settings > API e gere o arquivo de inicialização novamente."
        )

    browser_name, browser_path = localizar_navegador()
    if not browser_path:
        raise FileNotFoundError(
            "Nenhum navegador compatível foi localizado. "
            "Instale/ative Chrome, Edge ou Opera com Ui.Vision."
        )

    arquivo_macro = localizar_arquivo_macro(nome_macro)
    if not arquivo_macro:
        raise FileNotFoundError(
            f'Macro "{nome_macro}" não encontrada em {PASTA_MACROS}. '
            f"Arquivos encontrados: {', '.join(listar_macros()) or 'nenhuma macro'}"
        )

    PASTA_DATASOURCES.mkdir(parents=True, exist_ok=True)
    log_path = PASTA_DATASOURCES / f"uivision_{int(time.time() * 1000)}.txt"
    comando_url = construir_url_macro(nome_macro, arquivo_macro, log_path, run_id=run_id, soc_ids=soc_ids)

    # ==========================================================
    # NOVO BLOCO: Força o UI.Vision a minimizar assim que abrir
    # ==========================================================
    def ocultar_uivision():
        def _rotina():
            time.sleep(1.5) # Dá 1.5s pro Chrome abrir a janela do UI.Vision
            try:
                EnumWindows = ctypes.windll.user32.EnumWindows
                EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int))
                GetWindowText = ctypes.windll.user32.GetWindowTextW
                GetWindowTextLength = ctypes.windll.user32.GetWindowTextLengthW
                IsWindowVisible = ctypes.windll.user32.IsWindowVisible
                ShowWindow = ctypes.windll.user32.ShowWindow

                def foreach_window(hwnd, lParam):
                    if IsWindowVisible(hwnd):
                        length = GetWindowTextLength(hwnd)
                        buff = ctypes.create_unicode_buffer(length + 1)
                        GetWindowText(hwnd, buff, length + 1)
                        # Se encontrar a janela escura do IDE, joga pra barra de tarefas
                        if "Ui.Vision IDE" in buff.value:
                            ShowWindow(hwnd, 6) # 6 = Comando do Windows para Minimizar
                    return True
                
                # Fica vigiando por 4 segundos para garantir que vai pegar a janela
                for _ in range(4):
                    EnumWindows(EnumWindowsProc(foreach_window), 0)
                    time.sleep(1)
            except:
                pass
        threading.Thread(target=_rotina, daemon=True).start()

    ocultar_uivision()
    # ==========================================================

    try:
        processo = subprocess.Popen(
            [str(browser_path), comando_url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        )
    except OSError as e:
        raise FileNotFoundError(
            f"O Windows não conseguiu iniciar o navegador. Caminho usado: {browser_path}. "
            f"Erro do SO: {e}"
        ) from e

    log_text = aguardar_log(log_path, timeout=4.0)
    log_lower = log_text.lower()
    if "can't find macro with name" in log_lower or "cannot find macro" in log_lower:
        raise RuntimeError(
            f'A Ui.Vision abriu, mas não localizou a macro "{nome_query_macro(nome_macro, arquivo_macro)}". '
            "Confirme em Ui.Vision > Settings > XModule que o Home folder é "
            f"{PASTA_BASE} e que o modo de armazenamento está em Hard-Drive/File System."
        )

    return {
        "pid": processo.pid,
        "url": comando_url,
        "log": str(log_path),
        "macro": nome_macro,
        "macro_query": nome_query_macro(nome_macro, arquivo_macro),
        "arquivo_macro": str(arquivo_macro),
        "browser": browser_name,
        "browser_path": str(browser_path),
        "log_initial": log_text,
    }


# ================================================================
# ROTAS
# ================================================================
@app.get("/health")
def health():
    d = diagnostico_ambiente()
    return jsonify({
        "status": "ok",
        **d,
    })


@app.post("/diagnostico-macro")
def diagnostico_macro():
    dados = request.get_json(silent=True) or {}
    macro = normalizar_nome_macro(dados.get("macro"))
    arquivo = localizar_arquivo_macro(macro) if macro else None
    return jsonify({
        "macro": macro,
        "arquivo": str(arquivo) if arquivo else None,
        "encontrada": bool(arquivo),
        "pasta_macros": str(PASTA_MACROS),
        "ui_vision_html": str(HTML_API),
        "ui_vision_html_existe": HTML_API.exists(),
        "browser": localizar_navegador()[0],
        "browser_path": str(localizar_navegador()[1]) if localizar_navegador()[1] else None,
        "macro_query": nome_query_macro(macro, arquivo) if arquivo else None,
    })


@app.post("/executar-macro")
def executar_macro():
    dados = request.get_json(silent=True) or {}
    macro = normalizar_nome_macro(dados.get("macro"))
    if macro not in MACROS_PERMITIDAS:
        return jsonify({
            "status": "erro",
            "mensagem": f"Macro não permitida ou não cadastrada: {macro or 'vazio'}",
            "macros_permitidas": sorted(MACROS_PERMITIDAS),
        }), 400

    try:
        info = disparar_macro(macro)
        return jsonify({
            "status": "sucesso",
            "macro": info["macro"],
            "macro_query": info["macro_query"],
            "arquivo_macro": info["arquivo_macro"],
            "pid": info["pid"],
            "browser": info["browser"],
            "mensagem": f"Macro '{info['macro']}' enviada ao Ui.Vision.",
            "log": info["log"],
            "url": info["url"],
        })
    except (FileNotFoundError, ValueError, RuntimeError) as e:
        return jsonify({"status": "erro", "mensagem": str(e)}), 404 if isinstance(e, FileNotFoundError) else 500
    except Exception as e:
        print(f"❌ Erro ao disparar macro: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500


@app.post("/executar-automacao")
def executar_automacao():
    dados = request.get_json(silent=True) or {}
    colaboradores = dados.get("colaboradores", [])
    if not colaboradores:
        return jsonify({"status": "erro", "mensagem": "Nenhum colaborador enviado."}), 400

    try:
        PASTA_DATASOURCES.mkdir(parents=True, exist_ok=True)
        with open(CSV_ATIVACAO_PATH, "w", encoding="latin1", newline="") as f:
            for item in colaboradores:
                cpf = str(item.get("cpf", "")).strip().replace('"', '').replace("'", "")
                cargo = str(item.get("cargo", "")).strip().replace('"', '').replace("'", "")
                unidade = str(item.get("unidade", "")).strip().replace('"', '').replace("'", "")
                if cpf:
                    f.write(f"{cpf};{cargo};{unidade}\n")
            f.flush()
            os.fsync(f.fileno())

        with open(PASTA_DATASOURCES / "lista_ativacao.json", "w", encoding="utf-8") as f:
            json.dump(colaboradores, f, ensure_ascii=False, indent=2)

        info = disparar_macro(MACRO_ATIVACAO)
        return jsonify({
            "status": "sucesso",
            "pid": info["pid"],
            "macro": info["macro"],
            "macro_query": info["macro_query"],
            "mensagem": (
                f"Dados gravados e macro '{info['macro']}' enviada ao Ui.Vision "
                f"para {len(colaboradores)} colaborador(es)."
            ),
        })
    except Exception as e:
        print(f"❌ Erro na execução: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500


@app.post("/executar-soc")
def executar_soc():
    dados = request.get_json(silent=True) or {}
    ids = dados.get("ids", [])
    run_id = dados.get("run_id")
    if not ids:
        return jsonify({"status": "erro", "mensagem": "Nenhum ID enviado."}), 400
    try:
        PASTA_DATASOURCES.mkdir(parents=True, exist_ok=True)
        with open(CSV_SOC_PATH, "w", encoding="utf-8-sig", newline="") as f:
            for id_item in ids:
                clean_id = str(id_item).strip().replace('"', '').replace("'", "")
                if clean_id:
                    f.write(f"{clean_id}\n")

        # Pega os IDs, junta com vírgula e envia na URL!
        ids_string = ",".join(ids)
        info = disparar_macro(MACRO_SOC, run_id=run_id, soc_ids=ids_string)
        
        return jsonify({
            "status": "sucesso",
            "pid": info["pid"],
            "macro": info["macro"],
            "macro_query": info["macro_query"],
            "csv": str(CSV_SOC_PATH),
            "mensagem": f"colaboradores.csv atualizado e macro enviada para {len(ids)} ID(s)."
        })
    except Exception as e:
        print(f"❌ Erro na execução SOC: {e}")
        return jsonify({"status": "erro", "mensagem": str(e)}), 500

@app.post("/webhook-uivision")
def webhook_uivision():
    """Recebe os dados extraídos pelo robô e salva no banco json local"""
    req = request.get_json(silent=True) or {}
    resultados = []
    if RESULTADOS_SOC_PATH.exists():
        try:
            resultados = json.loads(RESULTADOS_SOC_PATH.read_text(encoding="utf-8"))
        except: pass
    resultados.append(req)
    RESULTADOS_SOC_PATH.write_text(json.dumps(resultados, indent=2, ensure_ascii=False), encoding="utf-8")
    return jsonify({"status": "ok"})

@app.get("/resultados-soc")
def resultados_soc():
    """Devolve os dados para a tela de Auditoria Histórico"""
    run_id = request.args.get("run_id")
    if not RESULTADOS_SOC_PATH.exists():
        return jsonify([])
    try:
        resultados = json.loads(RESULTADOS_SOC_PATH.read_text(encoding="utf-8"))
        if run_id:
            resultados = [r for r in resultados if r.get("run_id") == run_id]
        return jsonify(resultados)
    except:
        return jsonify([])

if __name__ == "__main__":
    d = diagnostico_ambiente()
    print("=" * 78)
    print("🚀 Bridge UI.Vision ativo em http://127.0.0.1:5000")
    print(f"📂 Home: {PASTA_BASE}")
    print(f"📂 Macros: {PASTA_MACROS}")
    print(f"📄 ui.vision.html: {HTML_API} | existe={HTML_API.exists()}")
    print(f"🌐 Navegador: {d['browser']} | {d['browser_path']}")
    print(f"🤖 Macro SOC: {d['macro_soc']} | query={d['macro_soc_query']}")
    print(f"🤖 Macro ATIVAÇÃO: {d['macro_ativacao']}")
    if d["issues"]:
        print("⚠️ Diagnóstico:")
        for issue in d["issues"]:
            print(f"   - {issue}")
    else:
        print("✅ Ambiente básico validado.")
    print("=" * 78)
    app.run(host="127.0.0.1", port=5000, debug=False)
