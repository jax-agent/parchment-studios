defmodule ParchmentStudios.Worlds.LoreEntry do
  use Ecto.Schema
  import Ecto.Changeset

  @valid_types ~w(place character creature faction event item)

  schema "lore_entries" do
    field :title, :string
    field :type, :string
    field :content, :string, default: ""
    # Stored as JSON string; decode/encode in context layer
    field :map_pins, :string, default: "[]"

    belongs_to :project, ParchmentStudios.Worlds.Project

    timestamps(type: :utc_datetime)
  end

  def changeset(lore_entry, attrs) do
    lore_entry
    |> cast(attrs, [:title, :type, :content, :map_pins, :project_id])
    |> validate_required([:title, :type, :project_id])
    |> validate_inclusion(:type, @valid_types,
      message: "must be one of: #{Enum.join(@valid_types, ", ")}"
    )
    |> foreign_key_constraint(:project_id)
  end

  def valid_types, do: @valid_types
end
