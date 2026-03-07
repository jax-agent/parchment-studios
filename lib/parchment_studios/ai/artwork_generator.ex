defmodule ParchmentStudios.AI.ArtworkGenerator do
  @moduledoc """
  Generates art prompts for location artwork.
  For MVP: generates detailed prompts stored in location metadata for future image generation.
  """

  @type_styles %{
    "city" => "grand medieval city with towering spires, bustling markets, and stone walls",
    "town" =>
      "quaint medieval town with thatched roofs, a central square, and cobblestone streets",
    "village" => "small rustic village with wooden cottages, farmlands, and a gentle stream",
    "dungeon" =>
      "dark and foreboding dungeon entrance carved into ancient stone, with glowing runes",
    "landmark" => "majestic natural or magical landmark radiating ancient power",
    "fortress" => "imposing stone fortress with battlements, watchtowers, and a drawbridge",
    "ruins" => "crumbling ancient ruins overgrown with vines, hinting at past grandeur",
    "natural_feature" =>
      "breathtaking natural landscape with dramatic terrain and mystical atmosphere",
    "region" => "vast panoramic vista showing diverse terrain and distant settlements"
  }

  def generate_prompt(location) do
    style = Map.get(@type_styles, location.type, "fantasy landscape")
    description_context = if location.description, do: " #{location.description}", else: ""

    prompt =
      "Fantasy illustration of #{location.name}, a #{style}.#{description_context} " <>
        "Painted in a detailed medieval manuscript style with rich colors, " <>
        "gold leaf accents, and ornate borders. High fantasy art, concept art quality, " <>
        "dramatic lighting, atmospheric perspective."

    {:ok, %{art_prompt: prompt, style: "medieval_manuscript"}}
  end
end
