defmodule ParchmentStudios.AI.ArtworkGeneratorTest do
  use ExUnit.Case, async: true

  alias ParchmentStudios.AI.ArtworkGenerator

  describe "generate_prompt/1" do
    test "generates prompt for each location type" do
      for type <- ~w(city town village dungeon landmark fortress ruins natural_feature region) do
        location = %{name: "Test Place", type: type, description: nil}

        assert {:ok, %{art_prompt: prompt, style: "medieval_manuscript"}} =
                 ArtworkGenerator.generate_prompt(location)

        assert prompt =~ "Test Place"
        assert prompt =~ "medieval manuscript"
      end
    end

    test "includes description in prompt when present" do
      location = %{
        name: "Stormkeep",
        type: "fortress",
        description: "A dark tower struck by eternal lightning"
      }

      {:ok, %{art_prompt: prompt}} = ArtworkGenerator.generate_prompt(location)
      assert prompt =~ "eternal lightning"
    end

    test "handles nil description" do
      location = %{name: "Stormkeep", type: "fortress", description: nil}
      {:ok, %{art_prompt: prompt}} = ArtworkGenerator.generate_prompt(location)
      assert prompt =~ "Stormkeep"
    end

    test "falls back to generic style for unknown type" do
      location = %{name: "Mystery", type: "unknown", description: nil}
      {:ok, %{art_prompt: prompt}} = ArtworkGenerator.generate_prompt(location)
      assert prompt =~ "fantasy landscape"
    end
  end
end
