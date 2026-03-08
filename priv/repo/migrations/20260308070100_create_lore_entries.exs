defmodule ParchmentStudios.Repo.Migrations.CreateLoreEntries do
  use Ecto.Migration

  def change do
    create table(:lore_entries) do
      add :title, :string, null: false
      add :type, :string, null: false
      add :content, :text, default: ""
      add :map_pins, :string, default: "[]"
      add :project_id, references(:projects, on_delete: :delete_all), null: false

      timestamps(type: :utc_datetime)
    end

    create index(:lore_entries, [:project_id])
    create index(:lore_entries, [:type])
  end
end
