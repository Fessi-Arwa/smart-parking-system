from .. import db

class Compte(db.Model):
    __tablename__ = "comptes"

    id_compte = db.Column(db.BigInteger, primary_key=True)
    nom = db.Column(db.String(150))
    email = db.Column(db.String(255), unique=True)
    mot_passe = db.Column(db.String(255))
    telephone = db.Column(db.String(30))
    role = db.Column(db.String(20))