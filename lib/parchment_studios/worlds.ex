defmodule ParchmentStudios.Worlds do
  import Ecto.Query
  alias ParchmentStudios.Repo
  alias ParchmentStudios.Worlds.{Project, WorldMap, Location}

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
end
