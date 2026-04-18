"""Gestionnaire de stockage pour les uploads."""
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Tuple


class StorageManager:
    """Gère l'espace disque et le nettoyage des fichiers temporaires."""

    def __init__(self, upload_folder: str, max_total_size: int, retention_days: int):
        """
        Initialiser le gestionnaire de stockage.
        
        Args:
            upload_folder: Chemin du dossier d'upload
            max_total_size: Taille maximale totale en bytes
            retention_days: Nombre de jours avant suppression des fichiers
        """
        self.upload_folder = Path(upload_folder)
        self.max_total_size = max_total_size
        self.retention_days = retention_days

    def get_total_size(self) -> int:
        """Obtenir la taille totale des uploads."""
        total = 0
        try:
            for dirpath, dirnames, filenames in os.walk(self.upload_folder):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    if os.path.exists(filepath):
                        total += os.path.getsize(filepath)
        except Exception as e:
            print(f"Erreur calcul taille stockage: {e}")
        return total

    def cleanup_old_files(self) -> Tuple[int, int]:
        """
        Nettoyer les fichiers plus anciens que retention_days.
        
        Returns:
            Tuple (fichiers supprimés, espace libéré en bytes)
        """
        cutoff_date = datetime.now() - timedelta(days=self.retention_days)
        files_deleted = 0
        space_freed = 0

        try:
            for dirpath, dirnames, filenames in os.walk(self.upload_folder):
                for filename in filenames:
                    filepath = os.path.join(dirpath, filename)
                    try:
                        file_mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                        if file_mtime < cutoff_date:
                            size = os.path.getsize(filepath)
                            os.remove(filepath)
                            files_deleted += 1
                            space_freed += size
                    except Exception as e:
                        print(f"Erreur suppression {filepath}: {e}")
            
            # Nettoyer les dossiers vides
            for dirpath, dirnames, filenames in os.walk(self.upload_folder, topdown=False):
                for dirname in dirnames:
                    folder_path = os.path.join(dirpath, dirname)
                    try:
                        if not os.listdir(folder_path):
                            os.rmdir(folder_path)
                    except Exception:
                        pass
        except Exception as e:
            print(f"Erreur nettoyage fichiers: {e}")

        return files_deleted, space_freed

    def ensure_space_available(self, required_space: int) -> bool:
        """
        S'assurer que l'espace disque est disponible.
        
        Args:
            required_space: Espace requis en bytes
            
        Returns:
            True si l'espace est disponible, False sinon
        """
        current_size = self.get_total_size()
        
        # Si l'espace sera dépassé, nettoyer les anciens fichiers
        if current_size + required_space > self.max_total_size:
            files_deleted, space_freed = self.cleanup_old_files()
            if files_deleted > 0:
                print(f"Nettoyage: {files_deleted} fichiers supprimés, {space_freed / 1024 / 1024:.2f} MB libérés")
                current_size = self.get_total_size()
        
        # Vérifier si l'espace est maintenant disponible
        return current_size + required_space <= self.max_total_size

    def get_storage_status(self) -> dict:
        """Obtenir le statut du stockage."""
        current_size = self.get_total_size()
        percentage = (current_size / self.max_total_size) * 100 if self.max_total_size > 0 else 0
        
        return {
            'current_size_mb': round(current_size / 1024 / 1024, 2),
            'max_size_mb': round(self.max_total_size / 1024 / 1024, 2),
            'usage_percentage': round(percentage, 1),
            'available_mb': round((self.max_total_size - current_size) / 1024 / 1024, 2),
        }
