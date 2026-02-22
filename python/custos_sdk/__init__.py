"""
custos_sdk — proof-of-work for AI agents (Python)

Add on-chain accountability to any agent framework in 3 lines.

Example:
    from custos_sdk import Custos

    custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)
    result = custos.inscribe_sync(
        block="research",
        summary="Analysed competitor positioning — 3 frameworks, no proof layer found",
        content=json.dumps(findings),
    )
    print(result["tx_hash"])
"""

from .client import Custos, InscribeResult, AttestResult

__all__ = ["Custos", "InscribeResult", "AttestResult"]
__version__ = "0.1.0"
