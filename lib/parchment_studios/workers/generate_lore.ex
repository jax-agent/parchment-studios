defmodule ParchmentStudios.Workers.GenerateLore do
  use Oban.Worker, queue: :ai, max_attempts: 1

  require Logger

  alias ParchmentStudios.Worlds

  @api_url "https://api.anthropic.com/v1/messages"
  @model "claude-haiku-4-5-20241022"

  @impl Oban.Worker
  def perform(%Oban.Job{
        args: %{"lore_entry_id" => lore_entry_id, "stamp_name" => name, "stamp_type" => type}
      }) do
    api_key = System.get_env("ANTHROPIC_API_KEY")

    if is_nil(api_key) or api_key == "" do
      Logger.warning("ANTHROPIC_API_KEY not set — skipping lore generation for #{name}")
      {:ok, :skipped}
    else
      lore_entry = Worlds.get_lore_entry!(lore_entry_id)
      generate_and_update(api_key, lore_entry, name, type)
    end
  end

  defp generate_and_update(api_key, lore_entry, name, type) do
    prompt = build_prompt(name, type)

    case call_api(api_key, prompt) do
      {:ok, content} ->
        formatted = format_content(content)

        {:ok, updated} =
          Worlds.update_lore_entry(lore_entry, %{
            content: formatted,
            title: content["name"] || name
          })

        Phoenix.PubSub.broadcast(
          ParchmentStudios.PubSub,
          "lore:#{lore_entry.id}",
          {:lore_generated, updated}
        )

        {:ok, updated}

      {:error, reason} ->
        Logger.warning("Lore generation failed for #{name}: #{inspect(reason)}")
        {:ok, :skipped}
    end
  end

  defp build_prompt(name, type) do
    """
    You are a fantasy worldbuilding assistant. Generate seed lore for a #{type} called "#{name}" in a classic fantasy world.

    Respond with ONLY valid JSON (no markdown, no explanation):
    {
      "name": "evocative fantasy name",
      "backstory": "2-sentence rich history",
      "hooks": ["story hook 1", "story hook 2"]
    }
    """
  end

  defp call_api(api_key, prompt) do
    body =
      Jason.encode!(%{
        model: @model,
        max_tokens: 300,
        messages: [%{role: "user", content: prompt}]
      })

    case Req.post(@api_url,
           body: body,
           headers: [
             {"x-api-key", api_key},
             {"anthropic-version", "2023-06-01"},
             {"content-type", "application/json"}
           ]
         ) do
      {:ok, %{status: 200, body: %{"content" => [%{"text" => text} | _]}}} ->
        parse_json(text)

      {:ok, %{status: status, body: body}} ->
        {:error, {:api_error, status, body}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp parse_json(text) do
    case Jason.decode(text) do
      {:ok, %{"name" => _, "backstory" => _, "hooks" => _} = parsed} -> {:ok, parsed}
      {:ok, _} -> {:error, :unexpected_json_shape}
      {:error, _} -> {:error, :json_parse_error}
    end
  end

  defp format_content(%{"name" => name, "backstory" => backstory, "hooks" => hooks}) do
    hook_lines = Enum.map_join(hooks, "\n", &"- #{&1}")

    """
    # #{name}

    #{backstory}

    ## Story Hooks
    #{hook_lines}
    """
    |> String.trim()
  end
end
