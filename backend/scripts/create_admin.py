import argparse
from pathlib import Path
import sys

from werkzeug.security import generate_password_hash

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app, db
from app.models.compte import Compte, RoleCompte


def parse_args():
    parser = argparse.ArgumentParser(description="Create an admin account.")
    parser.add_argument("--name", required=True, help="Admin full name")
    parser.add_argument("--email", required=True, help="Admin email")
    parser.add_argument("--password", required=True, help="Admin password")
    parser.add_argument("--phone", default=None, help="Admin phone number")
    return parser.parse_args()


def main():
    args = parse_args()
    email = args.email.strip().lower()

    app = create_app()
    with app.app_context():
        existing_user = Compte.query.filter_by(email=email).first()
        if existing_user:
            print(f"Un compte existe deja avec l email {email}.", file=sys.stderr)
            return 1

        admin = Compte(
            nom=args.name.strip(),
            email=email,
            telephone=args.phone.strip() if args.phone else None,
            mot_passe=generate_password_hash(args.password),
            role=RoleCompte.admin,
        )

        db.session.add(admin)
        db.session.commit()

        print(f"Compte admin cree avec succes: {admin.email} (id={admin.id_compte})")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
