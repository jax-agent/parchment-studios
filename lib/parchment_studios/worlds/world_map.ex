defmodule ParchmentStudios.Worlds.WorldMap do
  use Ecto.Schema
  import Ecto.Changeset

  schema "world_maps" do
    field :name, :string
    field :description, :string
    field :background_image, :string
    field :settings, :map, default: %{}

    belongs_to :project, ParchmentStudios.Worlds.Project
    has_many :locations, ParchmentStudios.Worlds.Location

    timestamps(type: :utc_datetime)
  end

  def changeset(world_map, attrs) do
    world_map
    |> cast(attrs, [:name, :description, :background_image, :settings, :project_id])
    |> validate_required([:name, :project_id])
    |> foreign_key_constraint(:project_id)
  end
end
