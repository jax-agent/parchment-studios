defmodule ParchmentStudios.Workers.GenerateLoreTest do
  use ParchmentStudios.DataCase

  alias ParchmentStudios.Workers.GenerateLore
  alias ParchmentStudios.Worlds

  setup do
    {:ok, project} = Worlds.create_project(%{name: "Test Realm", description: "A test world"})

    {:ok, lore_entry} =
      Worlds.create_lore_entry(%{
        title: "Old Tower",
        type: "place",
        content: "",
        project_id: project.id
      })

    %{project: project, lore_entry: lore_entry}
  end

  defp build_job(lore_entry) do
    %Oban.Job{
      args: %{
        "lore_entry_id" => lore_entry.id,
        "stamp_name" => "Old Tower",
        "stamp_type" => "place"
      }
    }
  end

  describe "perform/1" do
    test "returns {:ok, :skipped} when ANTHROPIC_API_KEY is not set", %{lore_entry: lore_entry} do
      original = System.get_env("ANTHROPIC_API_KEY")
      System.delete_env("ANTHROPIC_API_KEY")

      assert {:ok, :skipped} = GenerateLore.perform(build_job(lore_entry))

      if original, do: System.put_env("ANTHROPIC_API_KEY", original)
    end

    test "returns {:ok, :skipped} when API key is empty string", %{lore_entry: lore_entry} do
      original = System.get_env("ANTHROPIC_API_KEY")
      System.put_env("ANTHROPIC_API_KEY", "")

      assert {:ok, :skipped} = GenerateLore.perform(build_job(lore_entry))

      if original,
        do: System.put_env("ANTHROPIC_API_KEY", original),
        else: System.delete_env("ANTHROPIC_API_KEY")
    end
  end

  describe "job creation" do
    test "creates a valid Oban job changeset", %{lore_entry: lore_entry} do
      changeset =
        GenerateLore.new(%{
          lore_entry_id: lore_entry.id,
          stamp_name: "Old Tower",
          stamp_type: "place"
        })

      assert changeset.valid?
      assert changeset.changes.queue == "ai"
      assert changeset.changes.max_attempts == 1
    end
  end
end
