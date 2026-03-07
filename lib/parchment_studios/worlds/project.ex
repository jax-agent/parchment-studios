defmodule ParchmentStudios.Worlds.Project do
  use Ecto.Schema
  import Ecto.Changeset

  schema "projects" do
    field :name, :string
    field :description, :string
    field :user_id, :string

    has_many :world_maps, ParchmentStudios.Worlds.WorldMap

    timestamps(type: :utc_datetime)
  end

  def changeset(project, attrs) do
    project
    |> cast(attrs, [:name, :description, :user_id])
    |> validate_required([:name])
  end
end
