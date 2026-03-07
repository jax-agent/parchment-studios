defmodule ParchmentStudios.Worlds.Location do
  use Ecto.Schema
  import Ecto.Changeset

  @location_types ~w(city town village dungeon landmark fortress ruins natural_feature region)

  schema "locations" do
    field :name, :string
    field :type, :string
    field :latitude, :float
    field :longitude, :float
    field :description, :string
    field :lore, :string
    field :artwork_url, :string
    field :stats, :map, default: %{}
    field :icon, :string

    belongs_to :world_map, ParchmentStudios.Worlds.WorldMap

    timestamps(type: :utc_datetime)
  end

  def changeset(location, attrs) do
    location
    |> cast(attrs, [
      :name,
      :type,
      :latitude,
      :longitude,
      :description,
      :lore,
      :artwork_url,
      :stats,
      :icon,
      :world_map_id
    ])
    |> validate_required([:name, :type, :latitude, :longitude, :world_map_id])
    |> validate_inclusion(:type, @location_types)
    |> foreign_key_constraint(:world_map_id)
  end

  def location_types, do: @location_types
end
