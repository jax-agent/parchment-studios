defmodule ParchmentStudios.AI.LoreGeneratorTest do
  use ExUnit.Case, async: true

  alias ParchmentStudios.AI.LoreGenerator

  defp mock_location(overrides \\ %{}) do
    Map.merge(
      %{name: "Ironhold", type: "fortress", latitude: 45.0, longitude: 90.0},
      overrides
    )
  end

  describe "build_prompt/2" do
    test "builds prompt with location details" do
      location = mock_location()
      prompt = LoreGenerator.build_prompt(location, [])

      assert prompt =~ "Ironhold"
      assert prompt =~ "fortress"
      assert prompt =~ "45.0"
      assert prompt =~ "DESCRIPTION:"
      assert prompt =~ "LORE:"
    end

    test "includes nearby locations in prompt" do
      location = mock_location()
      nearby = [%{name: "Silver River"}, %{name: "Iron Mountains"}]
      prompt = LoreGenerator.build_prompt(location, nearby)

      assert prompt =~ "Silver River"
      assert prompt =~ "Iron Mountains"
      assert prompt =~ "Nearby locations"
    end

    test "handles empty nearby locations" do
      location = mock_location()
      prompt = LoreGenerator.build_prompt(location, [])

      refute prompt =~ "Nearby locations"
    end
  end

  describe "generate/2" do
    test "returns error when no API key is configured" do
      original = Application.get_env(:parchment_studios, :openrouter_api_key)
      Application.put_env(:parchment_studios, :openrouter_api_key, nil)

      location = mock_location()
      assert {:error, :no_api_key} = LoreGenerator.generate(location)

      Application.put_env(:parchment_studios, :openrouter_api_key, original)
    end
  end
end
