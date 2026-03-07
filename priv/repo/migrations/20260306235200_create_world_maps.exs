defmodule ParchmentStudios.Repo.Migrations.CreateWorldMaps do
  use Ecto.Migration

  def change do
    create table(:world_maps) do
      add :name, :string, null: false
      add :description, :text
      add :background_image, :string
      add :settings, :map, default: %{}
      add :project_id, references(:projects, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:world_maps, [:project_id])
  end
end
