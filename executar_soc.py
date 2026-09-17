"""
Executor de Cadastros SOC — UI.Vision
--------------------------------------
CLI para disparar cadastros de IDs contra a ponte local (bridge_uivision.py).

Requisitos:
    pip install rich requests
"""

import sys
import time
from dataclasses import dataclass

import requests
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.prompt import Prompt
from rich import box

URL_API = "http://127.0.0.1:5000/executar-soc"
TIMEOUT_SEGUNDOS = 15

console = Console()


@dataclass
class Resultado:
    ok: bool
    mensagem: str
    ids: list[str]


def cabecalho() -> None:
    console.clear()
    console.print(
        Panel.fit(
            "[bold white]EXECUTOR DE CADASTROS SOC[/bold white]\n"
            "[dim]Integração UI.Vision · Bridge local[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            padding=(1, 4),
        )
    )
    console.print()


def ler_ids() -> list[str]:
    """Pede os IDs ao usuário e valida a entrada antes de prosseguir."""
    while True:
        bruto = Prompt.ask(
            "[bold cyan]IDs[/bold cyan] [dim](separados por vírgula, ex: 101, 102, 103)[/dim]"
        ).strip()

        if not bruto:
            console.print("[bold red]✗[/bold red] Nenhum ID informado. Tente novamente.\n")
            continue

        ids = [i.strip() for i in bruto.split(",") if i.strip()]

        invalidos = [i for i in ids if not i.isdigit()]
        if invalidos:
            console.print(
                f"[bold red]✗[/bold red] ID(s) inválido(s), use apenas números: "
                f"[yellow]{', '.join(invalidos)}[/yellow]\n"
            )
            continue

        return ids


def mostrar_resumo(ids: list[str]) -> None:
    tabela = Table(box=box.SIMPLE_HEAD, show_edge=False, pad_edge=False)
    tabela.add_column("#", style="dim", width=4, justify="right")
    tabela.add_column("ID enviado", style="bold white")

    for i, id_ in enumerate(ids, start=1):
        tabela.add_row(str(i), id_)

    console.print(tabela)
    console.print()


def enviar(ids: list[str]) -> Resultado:
    payload = {"ids": ids}

    with Progress(
        SpinnerColumn(style="cyan"),
        TextColumn("[cyan]{task.description}"),
        console=console,
        transient=True,
    ) as progresso:
        progresso.add_task(f"Enviando {len(ids)} ID(s) para a ponte local...", total=None)
        try:
            resposta = requests.post(URL_API, json=payload, timeout=TIMEOUT_SEGUNDOS)
        except requests.exceptions.ConnectionError:
            return Resultado(
                ok=False,
                mensagem=(
                    "Não foi possível conectar ao bridge_uivision.py na porta 5000.\n"
                    "Confirme se o servidor Flask está rodando."
                ),
                ids=ids,
            )
        except requests.exceptions.Timeout:
            return Resultado(
                ok=False,
                mensagem=f"A ponte local não respondeu em {TIMEOUT_SEGUNDOS}s.",
                ids=ids,
            )
        except Exception as e:
            return Resultado(ok=False, mensagem=f"Erro inesperado: {e}", ids=ids)

    try:
        corpo = resposta.json()
    except ValueError:
        return Resultado(
            ok=False,
            mensagem=f"Resposta inválida do servidor (status {resposta.status_code}).",
            ids=ids,
        )

    if resposta.status_code == 200:
        return Resultado(ok=True, mensagem=corpo.get("mensagem", "Sucesso."), ids=ids)

    return Resultado(
        ok=False,
        mensagem=corpo.get("mensagem", f"Erro do servidor (status {resposta.status_code})."),
        ids=ids,
    )


def mostrar_resultado(resultado: Resultado) -> None:
    console.print()
    if resultado.ok:
        console.print(
            Panel(
                f"[bold green]✓ Sucesso[/bold green]\n\n{resultado.mensagem}",
                border_style="green",
                box=box.ROUNDED,
                padding=(1, 3),
                title="[green]Concluído[/green]",
                title_align="left",
            )
        )
    else:
        console.print(
            Panel(
                f"[bold red]✗ Falha[/bold red]\n\n{resultado.mensagem}",
                border_style="red",
                box=box.ROUNDED,
                padding=(1, 3),
                title="[red]Erro[/red]",
                title_align="left",
            )
        )


def main() -> None:
    cabecalho()

    try:
        ids = ler_ids()
        console.print()
        mostrar_resumo(ids)

        if not Prompt.ask(
            "[bold]Confirmar envio?[/bold]", choices=["s", "n"], default="s"
        ) == "s":
            console.print("[yellow]Operação cancelada pelo usuário.[/yellow]")
            return

        resultado = enviar(ids)
        mostrar_resultado(resultado)

    except KeyboardInterrupt:
        console.print("\n[yellow]Operação interrompida (Ctrl+C).[/yellow]")
        sys.exit(1)


if __name__ == "__main__":
    main()
