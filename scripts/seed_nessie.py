"""Offline funding persona stub. Owner D."""

import json


def main():
    # TODO(D): seed demo customer and account IDs in Nessie with idempotent setup.
    # Future funding transfers must independently require explicit human confirmation.
    print("OFFLINE persona preview. No Nessie API calls or transfers.")
    print(
        json.dumps(
            {
                "customer_id": "demo",
                "from_account_id": "checking-demo",
                "to_account_id": "investment-demo",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
