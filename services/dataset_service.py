
from pathlib import Path
import pandas as pd

# Find the main project folder
PROJECT_DIR = Path(__file__).resolve().parent.parent

# Location of the CSV files
DATA_DIR = PROJECT_DIR / "data"

# All four datasets
DATASET_FILES = {
    "cardiovascular": "cardiovascular.csv",
    "immune_alamar": "immune_alamar.csv",
    "immune_eve": "immune_eve.csv",
    "metabolic": "metabolic.csv",
}


def load_all_datasets():
    """Load all four CSV datasets."""

    datasets = {}

    for dataset_name, filename in DATASET_FILES.items():
        file_path = DATA_DIR / filename

        if not file_path.exists():
            raise FileNotFoundError(
                f"Dataset not found: {file_path}"
            )

        datasets[dataset_name] = pd.read_csv(file_path)

    return datasets


def get_dataset_summary():
    """Return the record count and column count for each dataset."""

    datasets = load_all_datasets()
    summary = {}

    for name, dataframe in datasets.items():
        summary[name] = {
            "records": len(dataframe),
            "columns": len(dataframe.columns),
            "column_names": list(dataframe.columns),
        }

    return summary


def get_dataset_records(dataset_name, limit=50):
    """Return records from one selected dataset."""

    if dataset_name not in DATASET_FILES:
        raise ValueError("Invalid dataset name")

    datasets = load_all_datasets()

    dataframe = datasets[dataset_name]

    # Replace missing values so the data can be displayed as JSON
    dataframe = dataframe.fillna("")

    return dataframe.head(limit).to_dict(orient="records")
