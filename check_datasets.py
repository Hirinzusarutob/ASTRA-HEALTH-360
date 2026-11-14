
import csv
import os

dataset_files = [
    "cardiovascular.csv",
    "immune_alamar.csv",
    "immune_eve.csv",
    "metabolic.csv"
]

data_folder = "data"

for filename in dataset_files:
    filepath = os.path.join(data_folder, filename)

    print("\n" + "=" * 50)
    print("DATASET:", filename)

    try:
        with open(filepath, "r", encoding="utf-8-sig", newline="") as file:
            reader = csv.DictReader(file)
            rows = list(reader)

            print("Columns:", reader.fieldnames)
            print("Total records:", len(rows))

            if rows:
                print("First record:", rows[0])

    except Exception as error:
        print("ERROR:", error)

print("\nDataset checking completed!")
