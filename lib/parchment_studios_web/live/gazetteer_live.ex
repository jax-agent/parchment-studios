defmodule ParchmentStudiosWeb.GazetteerLive do
  use ParchmentStudiosWeb, :live_view

  alias ParchmentStudios.Worlds

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Gazetteer",
       project: nil,
       world_map: nil,
       locations_by_type: %{}
     )}
  end

  @impl true
  def handle_params(%{"project_id" => project_id, "map_id" => map_id}, _uri, socket) do
    project = Worlds.get_project!(project_id)
    world_map = Worlds.get_world_map!(map_id)
    locations_by_type = Worlds.list_locations_by_type(map_id)

    {:noreply,
     assign(socket,
       project: project,
       world_map: world_map,
       locations_by_type: locations_by_type,
       page_title: "#{world_map.name} - Gazetteer"
     )}
  end

  defp type_label(type) do
    case type do
      "city" -> "Cities"
      "town" -> "Towns"
      "village" -> "Villages"
      "dungeon" -> "Dungeons"
      "landmark" -> "Landmarks"
      "fortress" -> "Fortresses"
      "ruins" -> "Ruins"
      "natural_feature" -> "Natural Features"
      "region" -> "Regions"
      _ -> String.capitalize(type) <> "s"
    end
  end

  defp type_order do
    ~w(region city fortress town village landmark dungeon ruins natural_feature)
  end

  defp sorted_types(locations_by_type) do
    type_order()
    |> Enum.filter(&Map.has_key?(locations_by_type, &1))
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="min-h-screen gazetteer-bg">
      <%!-- Book Cover --%>
      <div class="max-w-4xl mx-auto py-12 px-4">
        <div class="text-center mb-12">
          <.link
            navigate={~p"/projects/#{@project && @project.id}/maps/#{@world_map && @world_map.id}"}
            class="btn btn-ghost btn-sm mb-4"
          >
            <.icon name="hero-arrow-left" class="w-4 h-4" /> Back to Map
          </.link>

          <div class="border-y-4 border-double border-amber-800/30 py-8 mb-8">
            <h1 class="text-5xl font-serif font-bold text-amber-900 dark:text-amber-200 tracking-wide">
              {@world_map && @world_map.name}
            </h1>
            <p class="font-serif italic text-amber-800/60 dark:text-amber-300/60 mt-2 text-lg">
              A Gazetteer of Known Lands
            </p>
            <div class="flex justify-center gap-2 mt-4">
              <span class="text-amber-800/40 dark:text-amber-400/40">&#10040;</span>
              <span class="text-amber-800/40 dark:text-amber-400/40">&#10040;</span>
              <span class="text-amber-800/40 dark:text-amber-400/40">&#10040;</span>
            </div>
          </div>

          <p
            :if={@world_map && @world_map.description}
            class="font-serif text-amber-800/80 dark:text-amber-200/80 max-w-2xl mx-auto italic"
          >
            {@world_map.description}
          </p>
        </div>

        <%!-- Table of Contents --%>
        <div :if={@locations_by_type != %{}} class="book-page mb-8">
          <h2 class="text-2xl font-serif font-bold text-amber-900 dark:text-amber-200 mb-4 border-b-2 border-amber-800/20 pb-2">
            Table of Contents
          </h2>
          <ul class="font-serif space-y-1">
            <li
              :for={type <- sorted_types(@locations_by_type)}
              class="flex justify-between text-amber-800 dark:text-amber-300"
            >
              <span>{type_label(type)}</span>
              <span class="border-b border-dotted border-amber-800/30 dark:border-amber-400/30 flex-1 mx-2 mb-1">
              </span>
              <span class="text-amber-800/60 dark:text-amber-300/60">
                {length(@locations_by_type[type])}
              </span>
            </li>
          </ul>
        </div>

        <%!-- Location Pages by Type --%>
        <div :for={type <- sorted_types(@locations_by_type)}>
          <div class="book-page mb-2">
            <h2 class="text-3xl font-serif font-bold text-amber-900 dark:text-amber-200 border-b-2 border-amber-800/20 pb-2 mb-6">
              {type_label(type)}
            </h2>
          </div>

          <div :for={location <- @locations_by_type[type]} class="book-page mb-6">
            <div class="flex items-start gap-6">
              <div :if={location.artwork_url} class="w-48 flex-shrink-0">
                <img
                  src={location.artwork_url}
                  class="rounded border-2 border-amber-800/20 shadow-lg w-full"
                />
              </div>

              <div class="flex-1">
                <h3 class="text-2xl font-serif font-bold text-amber-900 dark:text-amber-200">
                  {location.name}
                </h3>

                <p
                  :if={location.description}
                  class="font-serif text-amber-800/90 dark:text-amber-200/90 mt-2 leading-relaxed italic"
                >
                  {location.description}
                </p>

                <div
                  :if={location.lore}
                  class="mt-4 font-serif text-amber-800/80 dark:text-amber-200/80 leading-relaxed whitespace-pre-line"
                >
                  {location.lore}
                </div>

                <div
                  :if={location.stats && map_size(location.stats) > 0}
                  class="mt-4 grid grid-cols-2 gap-2 text-sm"
                >
                  <div
                    :for={{key, value} <- location.stats}
                    :if={key != "art_prompt"}
                    class="font-serif"
                  >
                    <span class="font-bold text-amber-900/60 dark:text-amber-300/60 capitalize">
                      {key}:
                    </span>
                    <span class="text-amber-800/80 dark:text-amber-200/80 ml-1">{value}</span>
                  </div>
                </div>

                <p class="text-xs text-amber-800/40 dark:text-amber-300/40 mt-3 font-serif italic">
                  Coordinates: ({Float.round(location.latitude, 2)}, {Float.round(
                    location.longitude,
                    2
                  )})
                </p>
              </div>
            </div>
          </div>
        </div>

        <div :if={@locations_by_type == %{}} class="book-page text-center py-16">
          <p class="font-serif text-amber-800/50 dark:text-amber-200/50 text-lg italic">
            No locations have been recorded in this land yet.
            <br />Return to the map to begin your survey.
          </p>
        </div>

        <%!-- Colophon --%>
        <div class="text-center py-8 font-serif text-amber-800/30 dark:text-amber-300/30 text-sm">
          <div class="flex justify-center gap-2 mb-2">
            <span>&#10040;</span>
            <span>&#10040;</span>
            <span>&#10040;</span>
          </div>
          <p>Compiled by the Cartographers of Parchment Studios</p>
        </div>
      </div>
    </div>
    """
  end
end
