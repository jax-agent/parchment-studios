defmodule ParchmentStudios.Repo.Migrations.CreateAssetPacks do
  use Ecto.Migration

  def change do
    create table(:asset_packs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      add :description, :string
      add :style, :string

      timestamps(type: :utc_datetime)
    end

    create unique_index(:asset_packs, [:name])
  end
end
