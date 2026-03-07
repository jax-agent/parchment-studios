defmodule ParchmentStudios.WorldsTest do
  use ParchmentStudios.DataCase, async: true

  alias ParchmentStudios.Worlds
  alias ParchmentStudios.Worlds.{Project, WorldMap, Location}

  # Test helpers

  defp project_attrs(overrides \\ %{}) do
    Map.merge(%{name: "Test Realm", description: "A test world"}, overrides)
  end

  defp create_project(_context \\ %{}) do
    {:ok, project} = Worlds.create_project(project_attrs())
    %{project: project}
  end

  defp create_world_map(%{project: project}) do
    {:ok, world_map} =
      Worlds.create_world_map(%{name: "Test Map", description: "A map", project_id: project.id})

    %{world_map: world_map}
  end

  defp location_attrs(world_map, overrides \\ %{}) do
    Map.merge(
      %{
        name: "Test City",
        type: "city",
        latitude: 45.0,
        longitude: 90.0,
        world_map_id: world_map.id
      },
      overrides
    )
  end

  # Project tests

  describe "projects" do
    test "list_projects/0 returns all projects" do
      %{project: project} = create_project()
      assert [fetched] = Worlds.list_projects()
      assert fetched.id == project.id
    end

    test "get_project!/1 returns the project" do
      %{project: project} = create_project()
      assert Worlds.get_project!(project.id).id == project.id
    end

    test "create_project/1 with valid data creates a project" do
      assert {:ok, %Project{} = project} = Worlds.create_project(project_attrs())
      assert project.name == "Test Realm"
      assert project.description == "A test world"
    end

    test "create_project/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Worlds.create_project(%{name: nil})
    end

    test "update_project/2 with valid data updates the project" do
      %{project: project} = create_project()
      assert {:ok, %Project{} = updated} = Worlds.update_project(project, %{name: "New Name"})
      assert updated.name == "New Name"
    end

    test "delete_project/1 deletes the project" do
      %{project: project} = create_project()
      assert {:ok, %Project{}} = Worlds.delete_project(project)
      assert_raise Ecto.NoResultsError, fn -> Worlds.get_project!(project.id) end
    end

    test "change_project/1 returns a changeset" do
      %{project: project} = create_project()
      assert %Ecto.Changeset{} = Worlds.change_project(project)
    end
  end

  # WorldMap tests

  describe "world_maps" do
    setup do
      create_project()
    end

    test "list_world_maps/1 returns maps for a project", %{project: project} do
      %{world_map: world_map} = create_world_map(%{project: project})
      assert [fetched] = Worlds.list_world_maps(project.id)
      assert fetched.id == world_map.id
    end

    test "create_world_map/1 with valid data", %{project: project} do
      attrs = %{name: "Aldoria", project_id: project.id}
      assert {:ok, %WorldMap{} = wm} = Worlds.create_world_map(attrs)
      assert wm.name == "Aldoria"
    end

    test "create_world_map/1 requires name", %{project: project} do
      assert {:error, %Ecto.Changeset{}} =
               Worlds.create_world_map(%{project_id: project.id})
    end

    test "get_world_map_with_locations!/1 preloads locations", %{project: project} do
      %{world_map: world_map} = create_world_map(%{project: project})

      Worlds.create_location(location_attrs(world_map))

      loaded = Worlds.get_world_map_with_locations!(world_map.id)
      assert length(loaded.locations) == 1
    end

    test "delete_world_map/1 cascades to locations", %{project: project} do
      %{world_map: world_map} = create_world_map(%{project: project})
      {:ok, location} = Worlds.create_location(location_attrs(world_map))

      Worlds.delete_world_map(world_map)

      assert_raise Ecto.NoResultsError, fn -> Worlds.get_location!(location.id) end
    end
  end

  # Location tests

  describe "locations" do
    setup do
      %{project: project} = create_project()
      %{world_map: world_map} = create_world_map(%{project: project})
      %{project: project, world_map: world_map}
    end

    test "create_location/1 with valid data", %{world_map: world_map} do
      attrs = location_attrs(world_map)
      assert {:ok, %Location{} = loc} = Worlds.create_location(attrs)
      assert loc.name == "Test City"
      assert loc.type == "city"
      assert loc.latitude == 45.0
      assert loc.longitude == 90.0
    end

    test "create_location/1 validates type enum", %{world_map: world_map} do
      attrs = location_attrs(world_map, %{type: "invalid_type"})
      assert {:error, changeset} = Worlds.create_location(attrs)
      assert "is invalid" in errors_on(changeset).type
    end

    test "create_location/1 requires name, type, lat, lng", %{world_map: world_map} do
      assert {:error, changeset} = Worlds.create_location(%{world_map_id: world_map.id})
      errors = errors_on(changeset)
      assert errors[:name]
      assert errors[:type]
      assert errors[:latitude]
      assert errors[:longitude]
    end

    test "list_locations/1 returns locations for a map", %{world_map: world_map} do
      Worlds.create_location(location_attrs(world_map))
      assert [%Location{}] = Worlds.list_locations(world_map.id)
    end

    test "list_locations_by_type/1 groups by type", %{world_map: world_map} do
      Worlds.create_location(location_attrs(world_map, %{name: "City A", type: "city"}))

      Worlds.create_location(
        location_attrs(world_map, %{name: "Dungeon A", type: "dungeon", latitude: 50.0})
      )

      grouped = Worlds.list_locations_by_type(world_map.id)
      assert Map.has_key?(grouped, "city")
      assert Map.has_key?(grouped, "dungeon")
    end

    test "update_location/2 updates fields", %{world_map: world_map} do
      {:ok, location} = Worlds.create_location(location_attrs(world_map))
      assert {:ok, updated} = Worlds.update_location(location, %{name: "New City"})
      assert updated.name == "New City"
    end

    test "nearby_locations/2 finds locations within radius", %{world_map: world_map} do
      {:ok, loc1} =
        Worlds.create_location(
          location_attrs(world_map, %{name: "A", latitude: 45.0, longitude: 90.0})
        )

      {:ok, _loc2} =
        Worlds.create_location(
          location_attrs(world_map, %{name: "B", latitude: 46.0, longitude: 91.0})
        )

      {:ok, _loc3} =
        Worlds.create_location(
          location_attrs(world_map, %{name: "Far", latitude: 80.0, longitude: 80.0})
        )

      nearby = Worlds.nearby_locations(loc1, 5.0)
      assert length(nearby) == 1
      assert hd(nearby).name == "B"
    end

    test "all location types are valid", %{world_map: world_map} do
      for type <- ParchmentStudios.Worlds.Location.location_types() do
        attrs =
          location_attrs(world_map, %{
            name: "#{type}_place",
            type: type,
            latitude: :rand.uniform() * 90,
            longitude: :rand.uniform() * 180
          })

        assert {:ok, %Location{}} = Worlds.create_location(attrs)
      end
    end
  end
end
