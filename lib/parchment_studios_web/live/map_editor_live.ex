defmodule ParchmentStudiosWeb.MapEditorLive do
  use ParchmentStudiosWeb, :live_view

  alias ParchmentStudios.Worlds
  alias ParchmentStudios.Assets
  alias ParchmentStudios.AI.{LoreGenerator, ArtworkGenerator}

  @location_types ParchmentStudios.Worlds.Location.location_types()

  @default_layers [
    %{
      id: "terrain",
      name: "Terrain",
      visible: true,
      locked: false,
      opacity: 1.0,
      type: "terrain"
    },
    %{id: "water", name: "Water", visible: true, locked: false, opacity: 1.0, type: "water"},
    %{
      id: "features",
      name: "Features",
      visible: true,
      locked: false,
      opacity: 1.0,
      type: "features"
    },
    %{id: "labels", name: "Labels", visible: true, locked: false, opacity: 1.0, type: "labels"},
    %{id: "effects", name: "Effects", visible: true, locked: false, opacity: 1.0, type: "effects"}
  ]

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Map Editor",
       world_map: nil,
       project: nil,
       locations: [],
       selected_type: "city",
       selected_location: nil,
       location_form: nil,
       generating_lore: false,
       generating_art: false,
       location_types: @location_types,
       layer_panel_open: true,
       layers: @default_layers,
       active_layer: "features",
       active_tool: "select",
       # Asset library
       asset_library: %{},
       active_asset_category: "settlements",
       active_stamp_asset: nil,
       # Light angle: -π/4 = classic top-left fantasy lighting (degrees for slider: -45)
       light_angle_deg: -45,
       # Lore panel
       selected_lore_entry: nil,
       lore_entry_form: nil
     )}
  end

  @impl true
  def handle_params(%{"project_id" => project_id, "map_id" => map_id}, _uri, socket) do
    project = Worlds.get_project!(project_id)
    world_map = Worlds.get_world_map_with_locations!(map_id)

    # Load asset library
    asset_library =
      case Assets.list_packs() |> Enum.find(&(&1.style == "classic_fantasy")) do
        nil -> %{}
        pack -> Assets.list_assets(pack.id) |> Enum.group_by(& &1.category)
      end

    {:noreply,
     assign(socket,
       project: project,
       world_map: world_map,
       locations: world_map.locations,
       page_title: "#{world_map.name} - Map Editor",
       asset_library: asset_library
     )}
  end

  @impl true
  def handle_event("select_type", %{"type" => type}, socket) do
    {:noreply, assign(socket, selected_type: type)}
  end

  def handle_event("map_click", %{"lat" => lat, "lng" => lng}, socket) do
    attrs = %{
      name: "New #{String.capitalize(socket.assigns.selected_type)}",
      type: socket.assigns.selected_type,
      latitude: lat,
      longitude: lng,
      world_map_id: socket.assigns.world_map.id
    }

    case Worlds.create_location(attrs) do
      {:ok, location} ->
        locations = Worlds.list_locations(socket.assigns.world_map.id)

        {:noreply,
         socket
         |> assign(locations: locations, selected_location: location)
         |> assign(location_form: to_form(Worlds.change_location(location)))
         |> push_event("locations_updated", %{locations: encode_locations(locations)})}

      {:error, _changeset} ->
        {:noreply, put_flash(socket, :error, "Failed to place location")}
    end
  end

  def handle_event("select_location", %{"id" => id}, socket) do
    location = Worlds.get_location!(id)
    form = to_form(Worlds.change_location(location))
    {:noreply, assign(socket, selected_location: location, location_form: form)}
  end

  def handle_event("close_panel", _params, socket) do
    {:noreply, assign(socket, selected_location: nil, location_form: nil)}
  end

  def handle_event("update_location", %{"location" => params}, socket) do
    location = socket.assigns.selected_location

    case Worlds.update_location(location, params) do
      {:ok, updated} ->
        locations = Worlds.list_locations(socket.assigns.world_map.id)

        {:noreply,
         socket
         |> assign(
           selected_location: updated,
           locations: locations,
           location_form: to_form(Worlds.change_location(updated))
         )
         |> push_event("locations_updated", %{locations: encode_locations(locations)})}

      {:error, changeset} ->
        {:noreply, assign(socket, location_form: to_form(changeset))}
    end
  end

  def handle_event("move_location", %{"id" => id, "lat" => lat, "lng" => lng}, socket) do
    location = Worlds.get_location!(id)

    case Worlds.update_location(location, %{latitude: lat, longitude: lng}) do
      {:ok, updated} ->
        locations = Worlds.list_locations(socket.assigns.world_map.id)

        selected =
          if socket.assigns.selected_location && socket.assigns.selected_location.id == updated.id,
            do: updated,
            else: socket.assigns.selected_location

        {:noreply, assign(socket, locations: locations, selected_location: selected)}

      {:error, _} ->
        {:noreply, socket}
    end
  end

  def handle_event("generate_lore", _params, socket) do
    location = socket.assigns.selected_location
    nearby = Worlds.nearby_locations(location)

    socket = assign(socket, generating_lore: true)

    case LoreGenerator.generate(location, nearby) do
      {:ok, %{description: desc, lore: lore}} ->
        {:ok, updated} = Worlds.update_location(location, %{description: desc, lore: lore})
        locations = Worlds.list_locations(socket.assigns.world_map.id)

        {:noreply,
         socket
         |> assign(
           selected_location: updated,
           locations: locations,
           generating_lore: false,
           location_form: to_form(Worlds.change_location(updated))
         )}

      {:error, :no_api_key} ->
        {:noreply,
         socket
         |> put_flash(:error, "Set OPENROUTER_API_KEY to generate lore")
         |> assign(generating_lore: false)}

      {:error, _reason} ->
        {:noreply,
         socket
         |> put_flash(:error, "Failed to generate lore")
         |> assign(generating_lore: false)}
    end
  end

  def handle_event("generate_artwork", _params, socket) do
    location = socket.assigns.selected_location
    socket = assign(socket, generating_art: true)

    case ArtworkGenerator.generate_prompt(location) do
      {:ok, %{art_prompt: prompt}} ->
        stats = Map.merge(location.stats || %{}, %{"art_prompt" => prompt})
        {:ok, updated} = Worlds.update_location(location, %{stats: stats})

        {:noreply,
         socket
         |> assign(
           selected_location: updated,
           generating_art: false,
           location_form: to_form(Worlds.change_location(updated))
         )
         |> put_flash(:info, "Art prompt generated and stored")}
    end
  end

  def handle_event("delete_location", %{"id" => id}, socket) do
    location = Worlds.get_location!(id)
    {:ok, _} = Worlds.delete_location(location)
    locations = Worlds.list_locations(socket.assigns.world_map.id)

    {:noreply,
     socket
     |> assign(locations: locations, selected_location: nil, location_form: nil)
     |> push_event("locations_updated", %{locations: encode_locations(locations)})}
  end

  def handle_event("toggle_layer_panel", _params, socket) do
    {:noreply, assign(socket, layer_panel_open: !socket.assigns.layer_panel_open)}
  end

  def handle_event("toggle_layer_visibility", %{"id" => id}, socket) do
    layers =
      Enum.map(socket.assigns.layers, fn layer ->
        if layer.id == id, do: %{layer | visible: !layer.visible}, else: layer
      end)

    toggled = Enum.find(layers, &(&1.id == id))

    {:noreply,
     socket
     |> assign(layers: layers)
     |> push_event("layer_visibility_changed", %{id: id, visible: toggled.visible})}
  end

  def handle_event("set_active_layer", %{"id" => id}, socket) do
    {:noreply, assign(socket, active_layer: id)}
  end

  def handle_event("set_layer_opacity", %{"id" => id, "opacity" => opacity}, socket) do
    {opacity_val, _} = Float.parse(opacity)

    layers =
      Enum.map(socket.assigns.layers, fn layer ->
        if layer.id == id, do: %{layer | opacity: opacity_val}, else: layer
      end)

    {:noreply,
     socket
     |> assign(layers: layers)
     |> push_event("layer_opacity_changed", %{id: id, opacity: opacity_val})}
  end

  def handle_event("toggle_layer_lock", %{"id" => id}, socket) do
    layers =
      Enum.map(socket.assigns.layers, fn layer ->
        if layer.id == id, do: %{layer | locked: !layer.locked}, else: layer
      end)

    {:noreply, assign(socket, layers: layers)}
  end

  def handle_event("add_layer", _params, socket) do
    new_id = "custom-#{System.unique_integer([:positive])}"

    new_layer = %{
      id: new_id,
      name: "Custom Layer",
      visible: true,
      locked: false,
      opacity: 1.0,
      type: "custom"
    }

    {:noreply, assign(socket, layers: socket.assigns.layers ++ [new_layer])}
  end

  def handle_event("remove_layer", %{"id" => id}, socket) do
    layers = Enum.reject(socket.assigns.layers, &(&1.id == id))

    active_layer =
      if socket.assigns.active_layer == id do
        case layers do
          [first | _] -> first.id
          [] -> nil
        end
      else
        socket.assigns.active_layer
      end

    {:noreply, assign(socket, layers: layers, active_layer: active_layer)}
  end

  def handle_event("reorder_layer", %{"id" => id, "direction" => direction}, socket) do
    layers = socket.assigns.layers
    idx = Enum.find_index(layers, &(&1.id == id))

    new_layers =
      cond do
        direction == "up" && idx != nil && idx > 0 ->
          layers
          |> List.replace_at(idx, Enum.at(layers, idx - 1))
          |> List.replace_at(idx - 1, Enum.at(layers, idx))

        direction == "down" && idx != nil && idx < length(layers) - 1 ->
          layers
          |> List.replace_at(idx, Enum.at(layers, idx + 1))
          |> List.replace_at(idx + 1, Enum.at(layers, idx))

        true ->
          layers
      end

    {:noreply, assign(socket, layers: new_layers)}
  end

  def handle_event("set_tool", %{"tool" => tool}, socket) do
    {:noreply,
     socket
     |> assign(active_tool: tool)
     |> push_event("set_tool", %{tool: tool})}
  end

  def handle_event("set_light_angle", %{"angle_deg" => angle_deg_str}, socket) do
    angle_deg = String.to_integer(angle_deg_str)
    angle_rad = angle_deg * :math.pi() / 180.0

    {:noreply,
     socket
     |> assign(light_angle_deg: angle_deg)
     |> push_event("light_angle_changed", %{angle: angle_rad})}
  end

  def handle_event("set_asset_category", %{"category" => category}, socket) do
    {:noreply, assign(socket, active_asset_category: category)}
  end

  def handle_event("select_stamp", %{"id" => id}, socket) do
    # Find the asset across all categories
    asset =
      socket.assigns.asset_library
      |> Enum.flat_map(fn {_cat, assets} -> assets end)
      |> Enum.find(&(&1.id == id))

    if asset do
      {:noreply,
       socket
       |> assign(active_stamp_asset: asset, active_tool: "stamp")
       |> push_event("set_tool", %{tool: "stamp", stamp_asset: encode_stamp_asset(asset)})}
    else
      {:noreply, socket}
    end
  end

  def handle_event(
        "stamp_placed",
        %{"id" => stamp_id, "name" => name, "asset_category" => category} = _params,
        socket
      ) do
    # Create a LoreEntry seeded with stamp name and category-derived type
    lore_type = category_to_lore_type(category)
    project_id = socket.assigns.project.id

    case Worlds.create_lore_entry(%{
           title: name,
           type: lore_type,
           content: "",
           project_id: project_id
         }) do
      {:ok, lore_entry} ->
        # Tell canvas to update this MapObject's loreId
        {:noreply,
         socket
         |> push_event("lore_entry_created", %{stamp_id: stamp_id, lore_id: lore_entry.id})}

      {:error, _changeset} ->
        # Non-fatal: stamp is placed, lore just won't be linked
        {:noreply, socket}
    end
  end

  def handle_event("stamp_placed", _params, socket) do
    {:noreply, socket}
  end

  # When a stamp is clicked (no loreId) → just deselect lore panel
  def handle_event("object_selected", %{"lore_id" => nil}, socket) do
    {:noreply, assign(socket, selected_lore_entry: nil, lore_entry_form: nil)}
  end

  def handle_event("object_selected", %{"lore_id" => ""}, socket) do
    {:noreply, assign(socket, selected_lore_entry: nil, lore_entry_form: nil)}
  end

  # When a stamp with a loreId is clicked → open the lore panel
  def handle_event("object_selected", %{"lore_id" => lore_id}, socket) when is_binary(lore_id) do
    lore_entry = Worlds.get_lore_entry!(lore_id)
    form = to_form(Worlds.change_lore_entry(lore_entry))
    {:noreply, assign(socket, selected_lore_entry: lore_entry, lore_entry_form: form)}
  end

  def handle_event("object_selected", _params, socket) do
    {:noreply, assign(socket, selected_lore_entry: nil, lore_entry_form: nil)}
  end

  def handle_event("update_lore_entry", %{"lore_entry" => params}, socket) do
    lore_entry = socket.assigns.selected_lore_entry

    case Worlds.update_lore_entry(lore_entry, params) do
      {:ok, updated} ->
        {:noreply,
         assign(socket,
           selected_lore_entry: updated,
           lore_entry_form: to_form(Worlds.change_lore_entry(updated))
         )}

      {:error, changeset} ->
        {:noreply, assign(socket, lore_entry_form: to_form(changeset))}
    end
  end

  def handle_event("close_lore_panel", _params, socket) do
    {:noreply, assign(socket, selected_lore_entry: nil, lore_entry_form: nil)}
  end

  defp encode_stamp_asset(asset) do
    %{
      id: asset.id,
      name: asset.name,
      category: asset.category,
      thumbnail_url: asset.thumbnail_url,
      layers:
        Enum.map(asset.layers, fn layer ->
          type_raw = layer["type"] || layer[:type] || "base"
          blend_raw = layer["blend_mode"] || layer[:blend_mode] || "normal"

          %{
            id: layer["id"] || layer[:id],
            type: String.downcase(to_string(type_raw)),
            blendMode: String.downcase(to_string(blend_raw)),
            opacity: layer["opacity"] || layer[:opacity] || 1.0,
            visible: Map.get(layer, "visible", Map.get(layer, :visible, true)),
            frames: layer["frames"] || layer[:frames] || [],
            fps: layer["fps"] || layer[:fps] || 0,
            keyed_to: layer["keyed_to"] || layer[:keyed_to]
          }
        end)
    }
  end

  defp encode_locations(locations) do
    Enum.map(locations, fn loc ->
      %{
        id: loc.id,
        name: loc.name,
        type: loc.type,
        lat: loc.latitude,
        lng: loc.longitude,
        icon: loc.icon
      }
    end)
  end

  # Map asset category to LoreEntry type
  defp category_to_lore_type("settlements"), do: "place"
  defp category_to_lore_type("landmarks"), do: "place"
  defp category_to_lore_type("terrain"), do: "place"
  defp category_to_lore_type("water"), do: "place"
  defp category_to_lore_type(_), do: "place"

  defp type_icon(type) do
    case type do
      "city" -> "hero-building-office-2"
      "town" -> "hero-home-modern"
      "village" -> "hero-home"
      "dungeon" -> "hero-key"
      "landmark" -> "hero-star"
      "fortress" -> "hero-shield-check"
      "ruins" -> "hero-cube-transparent"
      "natural_feature" -> "hero-globe-americas"
      "region" -> "hero-map"
      _ -> "hero-map-pin"
    end
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex h-screen overflow-hidden bg-base-200">
      <%!-- Left Toolbar --%>
      <div class="w-16 bg-base-300 border-r border-base-content/10 flex flex-col items-center py-4 gap-2">
        <.link
          navigate={~p"/projects"}
          class="btn btn-ghost btn-sm btn-square mb-4"
          title="Back to Projects"
        >
          <.icon name="hero-arrow-left" class="w-5 h-5" />
        </.link>

        <div class="divider my-0"></div>
        <p class="text-[10px] text-base-content/40 font-serif">TOOLS</p>

        <button
          :for={type <- @location_types}
          phx-click="select_type"
          phx-value-type={type}
          class={"btn btn-sm btn-square #{if @selected_type == type, do: "btn-primary", else: "btn-ghost"}"}
          title={String.replace(type, "_", " ") |> String.capitalize()}
        >
          <.icon name={type_icon(type)} class="w-5 h-5" />
        </button>
      </div>

      <%!-- Map Area --%>
      <div class="flex-1 relative">
        <div class="absolute top-4 left-4 z-[1000]">
          <h2 class="text-lg font-serif font-bold text-base-content bg-base-100/80 backdrop-blur px-3 py-1 rounded shadow">
            {@world_map && @world_map.name}
          </h2>
          <p class="text-xs text-base-content/50 bg-base-100/80 backdrop-blur px-3 py-0.5 rounded-b">
            Click map to place:
            <span class="font-bold text-primary">{@selected_type |> String.replace("_", " ")}</span>
          </p>
        </div>

        <%!-- Layer Panel --%>
        <div
          :if={@layer_panel_open}
          class="absolute top-16 left-4 z-[1000] w-56 bg-base-100/95 backdrop-blur rounded-lg shadow-lg border border-base-content/10"
        >
          <div class="flex items-center justify-between px-3 py-2 border-b border-base-content/10">
            <span class="text-xs font-bold font-serif tracking-wide text-base-content/60">
              LAYERS
            </span>
            <div class="flex gap-1">
              <button
                phx-click="add_layer"
                class="btn btn-ghost btn-xs btn-square"
                title="Add layer"
              >
                <.icon name="hero-plus" class="w-3 h-3" />
              </button>
              <button
                phx-click="toggle_layer_panel"
                class="btn btn-ghost btn-xs btn-square"
                title="Close layers"
              >
                <.icon name="hero-x-mark" class="w-3 h-3" />
              </button>
            </div>
          </div>
          <div class="max-h-64 overflow-y-auto">
            <div
              :for={layer <- Enum.reverse(@layers)}
              class={"flex items-center gap-1 px-2 py-1.5 cursor-pointer hover:bg-base-200 #{if @active_layer == layer.id, do: "bg-primary/10 border-l-2 border-primary", else: "border-l-2 border-transparent"}"}
              phx-click="set_active_layer"
              phx-value-id={layer.id}
            >
              <button
                phx-click="toggle_layer_visibility"
                phx-value-id={layer.id}
                class="btn btn-ghost btn-xs btn-square"
                title={if layer.visible, do: "Hide layer", else: "Show layer"}
              >
                <.icon
                  name={if layer.visible, do: "hero-eye", else: "hero-eye-slash"}
                  class="w-3.5 h-3.5"
                />
              </button>
              <button
                phx-click="toggle_layer_lock"
                phx-value-id={layer.id}
                class="btn btn-ghost btn-xs btn-square"
                title={if layer.locked, do: "Unlock layer", else: "Lock layer"}
              >
                <.icon
                  name={if layer.locked, do: "hero-lock-closed", else: "hero-lock-open"}
                  class={"w-3 h-3 #{if layer.locked, do: "text-warning", else: "text-base-content/30"}"}
                />
              </button>
              <span class="flex-1 text-xs font-medium truncate">{layer.name}</span>
              <div class="flex gap-0.5">
                <button
                  phx-click="reorder_layer"
                  phx-value-id={layer.id}
                  phx-value-direction="up"
                  class="btn btn-ghost btn-xs btn-square"
                  title="Move up"
                >
                  <.icon name="hero-chevron-up" class="w-3 h-3" />
                </button>
                <button
                  phx-click="reorder_layer"
                  phx-value-id={layer.id}
                  phx-value-direction="down"
                  class="btn btn-ghost btn-xs btn-square"
                  title="Move down"
                >
                  <.icon name="hero-chevron-down" class="w-3 h-3" />
                </button>
                <button
                  phx-click="remove_layer"
                  phx-value-id={layer.id}
                  class="btn btn-ghost btn-xs btn-square text-error/50 hover:text-error"
                  title="Delete layer"
                >
                  <.icon name="hero-trash" class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
          <%!-- Opacity slider for active layer --%>
          <div class="px-3 py-2 border-t border-base-content/10">
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-base-content/40 w-12">Opacity</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={
                  Enum.find(@layers, &(&1.id == @active_layer)) &&
                    Enum.find(@layers, &(&1.id == @active_layer)).opacity
                }
                phx-change="set_layer_opacity"
                phx-value-id={@active_layer}
                name="opacity"
                class="range range-xs range-primary flex-1"
              />
            </div>
          </div>
          <%!-- Light angle slider — controls shadow/light layer direction --%>
          <div class="px-3 py-2 border-t border-base-content/10">
            <div class="flex items-center gap-2">
              <span class="text-[10px] text-base-content/40 w-12 leading-tight">☀️ Light</span>
              <input
                type="range"
                min="-180"
                max="180"
                step="5"
                value={@light_angle_deg}
                phx-change="set_light_angle"
                name="angle_deg"
                class="range range-xs range-warning flex-1"
                title={"Light angle: #{@light_angle_deg}°"}
              />
              <span class="text-[10px] text-base-content/40 w-8 text-right">{@light_angle_deg}°</span>
            </div>
          </div>
        </div>

        <%!-- Layer panel toggle (when closed) --%>
        <button
          :if={!@layer_panel_open}
          phx-click="toggle_layer_panel"
          class="absolute top-16 left-4 z-[1000] btn btn-sm bg-base-100/95 backdrop-blur shadow border-base-content/10"
          title="Show layers"
        >
          <.icon name="hero-squares-2x2" class="w-4 h-4" /> Layers
        </button>

        <%!-- Tool Mode Toolbar --%>
        <div class="absolute top-4 right-4 z-[1000] flex gap-1 bg-base-100/95 backdrop-blur rounded-lg shadow-lg border border-base-content/10 p-1">
          <button
            phx-click="set_tool"
            phx-value-tool="select"
            class={"btn btn-sm btn-square #{if @active_tool == "select", do: "btn-primary", else: "btn-ghost"}"}
            title="Select tool"
          >
            <.icon name="hero-cursor-arrow-rays" class="w-4 h-4" />
          </button>
          <button
            phx-click="set_tool"
            phx-value-tool="stamp"
            class={"btn btn-sm btn-square #{if @active_tool == "stamp", do: "btn-primary", else: "btn-ghost"}"}
            title="Stamp tool"
          >
            <.icon name="hero-square-2-stack" class="w-4 h-4" />
          </button>
        </div>

        <%!-- Asset Library Panel (bottom dock) --%>
        <div
          :if={@asset_library != %{}}
          class="absolute bottom-0 left-0 right-0 z-[1000] bg-base-100/95 backdrop-blur border-t border-base-content/10 shadow-lg"
        >
          <div class="flex items-center gap-1 px-3 py-1.5 border-b border-base-content/10">
            <span class="text-xs font-bold font-serif tracking-wide text-base-content/60 mr-2">
              STAMPS
            </span>
            <button
              :for={{category, _assets} <- @asset_library}
              phx-click="set_asset_category"
              phx-value-category={category}
              class={"btn btn-xs #{if @active_asset_category == category, do: "btn-primary", else: "btn-ghost"}"}
            >
              {category |> String.capitalize()}
            </button>
          </div>
          <div class="flex gap-2 p-3 overflow-x-auto">
            <div
              :for={asset <- Map.get(@asset_library, @active_asset_category, [])}
              phx-click="select_stamp"
              phx-value-id={asset.id}
              class={"flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer hover:bg-base-200 transition-colors min-w-[72px] #{if @active_stamp_asset && @active_stamp_asset.id == asset.id, do: "ring-2 ring-primary bg-primary/10", else: ""}"}
            >
              <img
                src={asset.thumbnail_url}
                alt={asset.name}
                class="w-14 h-14 object-contain"
              />
              <span class="text-[10px] text-base-content/70 text-center truncate w-16">
                {asset.name}
              </span>
            </div>
          </div>
        </div>

        <div
          id="map-container"
          phx-hook="MapEditorHook"
          phx-update="ignore"
          data-locations={Jason.encode!(encode_locations(@locations))}
          class="w-full h-full"
        >
        </div>
      </div>

      <%!-- Right Panel - Lore Entry (stamp click) --%>
      <div
        :if={@selected_lore_entry}
        class="w-80 bg-base-100 border-l border-base-content/10 overflow-y-auto shadow-xl flex-shrink-0"
      >
        <div class="p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <.icon name="hero-book-open" class="w-4 h-4 text-primary" />
              <span class="text-sm font-bold text-base-content/60 uppercase tracking-wider">Lore</span>
            </div>
            <button phx-click="close_lore_panel" class="btn btn-ghost btn-sm btn-square">
              <.icon name="hero-x-mark" class="w-4 h-4" />
            </button>
          </div>

          <.form
            for={@lore_entry_form}
            phx-change="update_lore_entry"
            phx-submit="update_lore_entry"
          >
            <.input
              field={@lore_entry_form[:title]}
              label="Name"
              class="font-serif text-lg"
            />
            <.input
              field={@lore_entry_form[:type]}
              label="Type"
              type="select"
              options={
                Enum.map(ParchmentStudios.Worlds.LoreEntry.valid_types(), fn t ->
                  {String.capitalize(t), t}
                end)
              }
            />
            <.input
              field={@lore_entry_form[:content]}
              label="Content"
              type="textarea"
              rows="10"
              placeholder="Write the history, secrets, and lore of this place..."
            />
          </.form>

          <div class="mt-3 pt-3 border-t border-base-content/10">
            <p class="text-xs text-base-content/40 font-mono">
              id: {@selected_lore_entry.id |> String.slice(0, 8)}…
            </p>
          </div>
        </div>
      </div>

      <%!-- Right Panel - Location Detail --%>
      <div
        :if={@selected_location}
        class="w-96 bg-base-100 border-l border-base-content/10 overflow-y-auto shadow-xl"
      >
        <div class="p-4">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-serif font-bold">{@selected_location.name}</h3>
            <button phx-click="close_panel" class="btn btn-ghost btn-sm btn-square">
              <.icon name="hero-x-mark" class="w-5 h-5" />
            </button>
          </div>

          <div class="badge badge-primary badge-sm font-serif mb-4">
            {@selected_location.type |> String.replace("_", " ") |> String.capitalize()}
          </div>

          <.form for={@location_form} phx-change="update_location" phx-submit="update_location">
            <.input field={@location_form[:name]} label="Name" />
            <.input
              field={@location_form[:type]}
              label="Type"
              type="select"
              options={
                Enum.map(@location_types, &{String.replace(&1, "_", " ") |> String.capitalize(), &1})
              }
            />
            <.input field={@location_form[:description]} label="Description" type="textarea" rows="3" />
            <.input field={@location_form[:lore]} label="Lore" type="textarea" rows="6" />
          </.form>

          <div class="flex gap-2 mt-4">
            <button
              phx-click="generate_lore"
              class="btn btn-secondary btn-sm flex-1"
              disabled={@generating_lore}
            >
              <span :if={@generating_lore} class="loading loading-spinner loading-xs"></span>
              <.icon :if={!@generating_lore} name="hero-sparkles" class="w-4 h-4" /> Generate Lore
            </button>
            <button
              phx-click="generate_artwork"
              class="btn btn-accent btn-sm flex-1"
              disabled={@generating_art}
            >
              <span :if={@generating_art} class="loading loading-spinner loading-xs"></span>
              <.icon :if={!@generating_art} name="hero-paint-brush" class="w-4 h-4" /> Generate Art
            </button>
          </div>

          <div :if={@selected_location.artwork_url} class="mt-4">
            <img src={@selected_location.artwork_url} class="rounded-lg w-full" />
          </div>

          <div :if={@selected_location.stats["art_prompt"]} class="mt-4 p-3 bg-base-200 rounded-lg">
            <p class="text-xs font-bold text-base-content/50 mb-1">Art Prompt</p>
            <p class="text-xs text-base-content/70 italic">
              {@selected_location.stats["art_prompt"]}
            </p>
          </div>

          <div class="mt-4 pt-4 border-t border-base-content/10">
            <p class="text-xs text-base-content/40">
              Coords: ({Float.round(@selected_location.latitude, 2)}, {Float.round(
                @selected_location.longitude,
                2
              )})
            </p>
            <button
              phx-click="delete_location"
              phx-value-id={@selected_location.id}
              data-confirm="Delete this location?"
              class="btn btn-ghost btn-xs text-error mt-2"
            >
              <.icon name="hero-trash" class="w-3 h-3" /> Delete Location
            </button>
          </div>
        </div>
      </div>
    </div>
    """
  end
end
