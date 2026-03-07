defmodule ParchmentStudios.AI.LoreGenerator do
  @moduledoc """
  Generates fantasy lore for locations using OpenRouter API.
  """

  @model "minimax/minimax-m2.5"
  @api_url "https://openrouter.ai/api/v1/chat/completions"

  def generate(location, nearby_locations \\ []) do
    prompt = build_prompt(location, nearby_locations)

    case call_api(prompt) do
      {:ok, response} -> parse_response(response)
      {:error, _} = error -> error
    end
  end

  def build_prompt(location, nearby_locations) do
    nearby_context =
      case nearby_locations do
        [] ->
          ""

        locations ->
          names = Enum.map_join(locations, ", ", & &1.name)
          "\nNearby locations: #{names}. Reference these in the lore to create a connected world."
      end

    """
    Create rich fantasy lore for a location with these details:
    - Name: #{location.name}
    - Type: #{location.type}
    - Coordinates: (#{location.latitude}, #{location.longitude})#{nearby_context}

    Respond in this exact format:
    DESCRIPTION: [A 2-3 sentence evocative description of this place]
    LORE: [A 2-3 paragraph extended lore entry covering history, notable features, culture, dangers, and legends]
    """
  end

  defp call_api(prompt) do
    api_key = Application.get_env(:parchment_studios, :openrouter_api_key)

    if is_nil(api_key) or api_key == "" do
      {:error, :no_api_key}
    else
      body =
        Jason.encode!(%{
          model: @model,
          messages: [
            %{
              role: "system",
              content:
                "You are a master fantasy worldbuilder. Create vivid, evocative lore for fantasy locations. " <>
                  "Your writing should feel like it belongs in a medieval chronicle or explorer's journal. " <>
                  "Include sensory details, historical events, and local legends."
            },
            %{role: "user", content: prompt}
          ]
        })

      case Req.post(@api_url,
             body: body,
             headers: [
               {"authorization", "Bearer #{api_key}"},
               {"content-type", "application/json"}
             ]
           ) do
        {:ok, %{status: 200, body: body}} -> {:ok, body}
        {:ok, %{status: status, body: body}} -> {:error, {status, body}}
        {:error, reason} -> {:error, reason}
      end
    end
  end

  defp parse_response(%{"choices" => [%{"message" => %{"content" => content}} | _]}) do
    {description, lore} = split_response(content)
    {:ok, %{description: description, lore: lore}}
  end

  defp parse_response(_), do: {:error, :unexpected_response}

  defp split_response(content) do
    parts =
      content
      |> String.split(~r/DESCRIPTION:\s*/i, parts: 2)
      |> List.last()
      |> String.split(~r/LORE:\s*/i, parts: 2)

    case parts do
      [desc, lore] -> {String.trim(desc), String.trim(lore)}
      [text] -> {String.trim(text), ""}
    end
  end
end
