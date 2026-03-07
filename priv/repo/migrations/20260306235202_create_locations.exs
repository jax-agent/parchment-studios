defmodule ParchmentStudios.Repo.Migrations.CreateLocations do
  use Ecto.Migration

  def change do
    create table(:locations) do
      add :name, :string, null: false
      add :type, :string, null: false
      add :latitude, :float, null: false
      add :longitude, :float, null: false
      add :description, :text
      add :lore, :text
      add :artwork_url, :string
      add :stats, :map, default: %{}
      add :icon, :string
      add :world_map_id, references(:world_maps, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:locations, [:world_map_id])
  end
end
