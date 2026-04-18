#!/usr/bin/env python3
"""Script de nettoyage périodique du stockage."""
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Ajouter le répertoire backend au chemin
backend_path = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_path))

from app.config import Config
from app.utils.storage_manager import StorageManager


def main():
    """Exécuter le nettoyage du stockage."""
    print("[Storage Cleanup] Démarrage du nettoyage...")
    print(f"[Storage Cleanup] Dossier: {Config.UPLOAD_FOLDER}")
    
    manager = StorageManager(
        Config.UPLOAD_FOLDER,
        Config.MAX_TOTAL_UPLOADS,
        Config.UPLOAD_RETENTION_DAYS
    )
    
    # Afficher le statut avant nettoyage
    before = manager.get_storage_status()
    print(f"\n[Storage Cleanup] AVANT nettoyage:")
    print(f"  - Espace utilisé: {before['current_size_mb']} MB / {before['max_size_mb']} MB")
    print(f"  - Utilisation: {before['usage_percentage']}%")
    print(f"  - Espace disponible: {before['available_mb']} MB")
    
    # Nettoyer les anciens fichiers
    print(f"\n[Storage Cleanup] Nettoyage des fichiers datant d'avant 30 jours...")
    files_deleted, space_freed = manager.cleanup_old_files()
    
    if files_deleted > 0:
        print(f"  - {files_deleted} fichiers supprimés")
        print(f"  - {space_freed / 1024 / 1024:.2f} MB libérés")
    else:
        print("  - Aucun fichier à supprimer")
    
    # Afficher le statut après nettoyage
    after = manager.get_storage_status()
    print(f"\n[Storage Cleanup] APRÈS nettoyage:")
    print(f"  - Espace utilisé: {after['current_size_mb']} MB / {after['max_size_mb']} MB")
    print(f"  - Utilisation: {after['usage_percentage']}%")
    print(f"  - Espace disponible: {after['available_mb']} MB")
    
    print(f"\n[Storage Cleanup] Nettoyage terminé.")
    return 0 if files_deleted >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
