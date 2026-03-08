defmodule ParchmentStudios.Worlds do
  import Ecto.Query
  alias ParchmentStudios.Repo
  alias ParchmentStudios.Worlds.{Project, WorldMap, Location, LoreEntry}

  # Projects

  def list_projects do
    Repo.all(Project)
  end

  def get_project!(id) do
    Repo.get!(Project, id)
  end

  def create_project(attrs \\ %{}) do
    %Project{}
    |> Project.changeset(attrs)
    |> Repo.insert()
  end

  def update_project(%Project{} = project, attrs) do
    project
    |> Project.changeset(attrs)
    |> Repo.update()
  end

  def delete_project(%Project{} = project) do
    Repo.delete(project)
  end

  def change_project(%Project{} = project, attrs \\ %{}) do
    Project.changeset(project, attrs)
  end

  # World Maps

  def list_world_maps(project_id) do
    WorldMap
    |> where(project_id: ^project_id)
    |> Repo.all()
  end

  def get_world_map!(id) do
    Repo.get!(WorldMap, id)
  end

  def get_world_map_with_locations!(id) do
    WorldMap
    |> Repo.get!(id)
    |> Repo.preload(:locations)
  end

  def create_world_map(attrs \\ %{}) do
    %WorldMap{}
    |> WorldMap.changeset(attrs)
    |> Repo.insert()
  end

  def update_world_map(%WorldMap{} = world_map, attrs) do
    world_map
    |> WorldMap.changeset(attrs)
    |> Repo.update()
  end

  def delete_world_map(%WorldMap{} = world_map) do
    Repo.delete(world_map)
  end

  def change_world_map(%WorldMap{} = world_map, attrs \\ %{}) do
    WorldMap.changeset(world_map, attrs)
  end

  # Locations

  def list_locations(world_map_id) do
    Location
    |> where(world_map_id: ^world_map_id)
    |> Repo.all()
  end

  def list_locations_by_type(world_map_id) do
    Location
    |> where(world_map_id: ^world_map_id)
    |> order_by(:type)
    |> Repo.all()
    |> Enum.group_by(& &1.type)
  end

  def get_location!(id) do
    Repo.get!(Location, id)
  end

  def create_location(attrs \\ %{}) do
    %Location{}
    |> Location.changeset(attrs)
    |> Repo.insert()
  end

  def update_location(%Location{} = location, attrs) do
    location
    |> Location.changeset(attrs)
    |> Repo.update()
  end

  def delete_location(%Location{} = location) do
    Repo.delete(location)
  end

  def change_location(%Location{} = location, attrs \\ %{}) do
    Location.changeset(location, attrs)
  end

  def nearby_locations(%Location{} = location, radius \\ 5.0) do
    Location
    |> where([l], l.world_map_id == ^location.world_map_id)
    |> where([l], l.id != ^location.id)
    |> where(
      [l],
      fragment(
        "abs(? - ?) + abs(? - ?) < ?",
        l.latitude,
        ^location.latitude,
        l.longitude,
        ^location.longitude,
        ^radius
      )
    )
    |> Repo.all()
  end

  # LoreEntries

  @doc "List all lore entries for a project."
  def list_lore_entries(project_id) do
    LoreEntry
    |> where([l], l.project_id == ^project_id)
    |> order_by([l], l.title)
    |> Repo.all()
  end

  @doc "List lore entries for a project filtered by type."
  def list_lore_entries_by_type(project_id, type) do
    LoreEntry
    |> where([l], l.project_id == ^project_id and l.type == ^type)
    |> order_by([l], l.title)
    |> Repo.all()
  end

  @doc "Get a single lore entry by id. Raises if not found."
  def get_lore_entry!(id), do: Repo.get!(LoreEntry, id)

  @doc "Create a lore entry."
  def create_lore_entry(attrs \\ %{}) do
    %LoreEntry{}
    |> LoreEntry.changeset(attrs)
    |> Repo.insert()
  end

  @doc "Update a lore entry."
  def update_lore_entry(%LoreEntry{} = lore_entry, attrs) do
    lore_entry
    |> LoreEntry.changeset(attrs)
    |> Repo.update()
  end

  @doc "Delete a lore entry."
  def delete_lore_entry(%LoreEntry{} = lore_entry) do
    Repo.delete(lore_entry)
  end
end
