defmodule ParchmentStudios.Worlds.LoreEntryTest do
  use ParchmentStudios.DataCase, async: true

  alias ParchmentStudios.Worlds
  alias ParchmentStudios.Worlds.LoreEntry

  # --- helpers ---

  defp create_project do
    {:ok, project} = Worlds.create_project(%{name: "Test Realm", description: "A test world"})
    project
  end

  defp lore_attrs(project, overrides \\ %{}) do
    Map.merge(
      %{
        title: "Ironhaven",
        type: "place",
        content: "A fortress city carved into the mountainside.",
        project_id: project.id
      },
      overrides
    )
  end

  # --- create ---

  describe "create_lore_entry/1" do
    test "creates a lore entry with valid attrs" do
      project = create_project()
      attrs = lore_attrs(project)

      assert {:ok, %LoreEntry{} = entry} = Worlds.create_lore_entry(attrs)
      assert entry.title == "Ironhaven"
      assert entry.type == "place"
      assert entry.content == "A fortress city carved into the mountainside."
      assert entry.project_id == project.id
    end

    test "returns error changeset with missing title" do
      project = create_project()
      attrs = lore_attrs(project, %{title: nil})
      assert {:error, changeset} = Worlds.create_lore_entry(attrs)
      assert %{title: ["can't be blank"]} = errors_on(changeset)
    end

    test "returns error changeset with invalid type" do
      project = create_project()
      attrs = lore_attrs(project, %{type: "dragon"})
      assert {:error, changeset} = Worlds.create_lore_entry(attrs)
      assert %{type: [_msg]} = errors_on(changeset)
    end

    test "accepts all valid types" do
      project = create_project()

      for type <- LoreEntry.valid_types() do
        attrs = lore_attrs(project, %{title: "Entry #{type}", type: type})
        assert {:ok, entry} = Worlds.create_lore_entry(attrs)
        assert entry.type == type
      end
    end
  end

  # --- get ---

  describe "get_lore_entry!/1" do
    test "returns lore entry by id" do
      project = create_project()
      {:ok, entry} = Worlds.create_lore_entry(lore_attrs(project))

      fetched = Worlds.get_lore_entry!(entry.id)
      assert fetched.id == entry.id
      assert fetched.title == entry.title
    end

    test "raises Ecto.NoResultsError for unknown id" do
      assert_raise Ecto.NoResultsError, fn ->
        Worlds.get_lore_entry!(0)
      end
    end
  end

  # --- update ---

  describe "update_lore_entry/2" do
    test "updates title and content" do
      project = create_project()
      {:ok, entry} = Worlds.create_lore_entry(lore_attrs(project))

      assert {:ok, updated} =
               Worlds.update_lore_entry(entry, %{
                 title: "Ironhaven Keep",
                 content: "Updated lore."
               })

      assert updated.title == "Ironhaven Keep"
      assert updated.content == "Updated lore."
    end

    test "returns error changeset for invalid update" do
      project = create_project()
      {:ok, entry} = Worlds.create_lore_entry(lore_attrs(project))

      assert {:error, changeset} = Worlds.update_lore_entry(entry, %{type: "invalid_type"})
      assert %{type: [_]} = errors_on(changeset)
    end
  end

  # --- delete ---

  describe "delete_lore_entry/1" do
    test "deletes the lore entry" do
      project = create_project()
      {:ok, entry} = Worlds.create_lore_entry(lore_attrs(project))

      assert {:ok, %LoreEntry{}} = Worlds.delete_lore_entry(entry)

      assert_raise Ecto.NoResultsError, fn ->
        Worlds.get_lore_entry!(entry.id)
      end
    end
  end

  # --- list ---

  describe "list_lore_entries/1" do
    test "returns all entries for a project" do
      project = create_project()
      other_project = create_project()

      {:ok, e1} = Worlds.create_lore_entry(lore_attrs(project, %{title: "Alpha"}))

      {:ok, e2} =
        Worlds.create_lore_entry(lore_attrs(project, %{title: "Beta", type: "character"}))

      {:ok, _} = Worlds.create_lore_entry(lore_attrs(other_project, %{title: "Other"}))

      entries = Worlds.list_lore_entries(project.id)
      ids = Enum.map(entries, & &1.id)

      assert e1.id in ids
      assert e2.id in ids
      assert length(entries) == 2
    end
  end

  # --- list by type ---

  describe "list_lore_entries_by_type/2" do
    test "returns only entries matching type" do
      project = create_project()

      {:ok, place1} = Worlds.create_lore_entry(lore_attrs(project, %{title: "City A"}))
      {:ok, place2} = Worlds.create_lore_entry(lore_attrs(project, %{title: "City B"}))

      {:ok, _char} =
        Worlds.create_lore_entry(lore_attrs(project, %{title: "Gorak", type: "character"}))

      places = Worlds.list_lore_entries_by_type(project.id, "place")
      ids = Enum.map(places, & &1.id)

      assert place1.id in ids
      assert place2.id in ids
      assert length(places) == 2
    end

    test "returns empty list when none match" do
      project = create_project()
      {:ok, _} = Worlds.create_lore_entry(lore_attrs(project))

      assert [] = Worlds.list_lore_entries_by_type(project.id, "creature")
    end
  end
end
