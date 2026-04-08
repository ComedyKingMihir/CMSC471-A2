import pandas as pd

df = pd.read_csv("OECD.ENV.EPI,DSD_AIR_GHG@DF_AIR_GHG,+all.csv", low_memory=False)

cols = ["Reference area", "TIME_PERIOD", "Measure", "Pollutant", "Unit of measure", "OBS_VALUE"]
df = df[cols]

df = df.dropna(subset=["OBS_VALUE"])

df = df[df["Pollutant"].isin(["Greenhouse gases", "Carbon dioxide"])]

df = df[df["TIME_PERIOD"].between(1990, 2018)]

df = df[~df["Reference area"].str.contains("OECD|Europe|G20|World|Total|European", case=False, na=False)]

df["OBS_VALUE"] = df["OBS_VALUE"].round(2)

df.to_csv("data.csv", index=False)
print(f"Done. Rows: {len(df)}, Size: {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")