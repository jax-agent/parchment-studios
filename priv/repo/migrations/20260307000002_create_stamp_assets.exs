defmodule ParchmentStudios.Repo.Migrations.CreateStampAssets do
  use Ecto.Migration

  def change do
    create table(:stamp_assets, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false

      add :pack_id, references(:asset_packs, type: :binary_id, on_delete: :delete_all),
        null: false

      add :category, :string
      add :layers, :map, default: "[]"
      add :thumbnail_url, :string

      timestamps(type: :utc_datetime)
    end

    create index(:stamp_assets, [:pack_id])
    create unique_index(:stamp_assets, [:name, :pack_id])
  end
end
