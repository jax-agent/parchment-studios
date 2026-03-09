defmodule ParchmentStudiosWeb.MapEditorLive do
  use ParchmentStudiosWeb, :live_view

  alias ParchmentStudios.Worlds
  alias ParchmentStudios.Assets
  alias ParchmentStudios.AI.{LoreGenerator, ArtworkGenerator}

  @location_types ParchmentStudios.Worlds.Location.location_types()

  @tools [
    %{id: "select", icon: "hero-cursor-arrow-rays", label: "Select", key: "V"},
    %{id: "pan", icon: "hero-hand-raised", label: "Pan", key: "H"},
    %{id: "stamp", icon: "hero-square-2-stack", label: "Stamp", key: "S"},
    %{id: "pattern", icon: "hero-squares-plus", label: "Pattern", key: "P"},
    %{id: "path", icon: "hero-pencil", label: "Path", key: "L"},
    %{id: "brush", icon: "hero-paint-brush", label: "Brush", key: "B"},
    %{id: "text", icon: "hero-language", label: "Text", key: "T"},
    %{id: "region", icon: "hero-map", label: "Region", key: "G"}
  ]

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
       lore_entry_form: nil,
       selected_object_id: nil,
       # Editor chrome
       zoom_level: 100,
       tools: @tools,
       # Brush options
       brush_color: "#4a7c59",
       brush_size: 20,
       brush_opacity: 75,
       # Export
       exporting: false,
       show_export_modal: false,
       export_resolution: "2k"
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

  def handle_event("zoom_changed", %{"zoom" => zoom}, socket) do
    zoom_pct = round(zoom * 100)
    {:noreply, assign(socket, zoom_level: zoom_pct)}
  end

  def handle_event("set_light_angle", %{"angle_deg" => angle_deg_str}, socket) do
    angle_deg = String.to_integer(angle_deg_str)
    angle_rad = angle_deg * :math.pi() / 180.0

    {:noreply,
     socket
     |> assign(light_angle_deg: angle_deg)
     |> push_event("light_angle_changed", %{angle: angle_rad})}
  end

  def handle_event("set_brush_color", %{"color" => color}, socket) do
    {:noreply,
     socket
     |> assign(brush_color: color)
     |> push_event("brush_options_changed", %{color: color})}
  end

  def handle_event("set_brush_size", %{"size" => size_str}, socket) do
    size = String.to_integer(size_str)

    {:noreply,
     socket
     |> assign(brush_size: size)
     |> push_event("brush_options_changed", %{size: size})}
  end

  def handle_event("set_brush_opacity", %{"opacity" => opacity_str}, socket) do
    opacity_pct = String.to_integer(opacity_str)

    {:noreply,
     socket
     |> assign(brush_opacity: opacity_pct)
     |> push_event("brush_options_changed", %{opacity: opacity_pct / 100})}
  end

  def handle_event("show_export_modal", _params, socket) do
    {:noreply, assign(socket, show_export_modal: true)}
  end

  def handle_event("hide_export_modal", _params, socket) do
    {:noreply, assign(socket, show_export_modal: false)}
  end

  def handle_event("set_export_resolution", %{"resolution" => res}, socket) do
    {:noreply, assign(socket, export_resolution: res)}
  end

  def handle_event("export_map", _params, socket) do
    {w, h} =
      case socket.assigns.export_resolution do
        "4k" -> {4096, 4096}
        "8k" -> {8192, 8192}
        _ -> {2048, 2048}
      end

    {:noreply,
     socket
     |> assign(exporting: true, show_export_modal: false)
     |> push_event("export_map", %{width: w, height: h})}
  end

  def handle_event("export_started", _params, socket) do
    {:noreply, assign(socket, exporting: true)}
  end

  def handle_event("export_complete", _params, socket) do
    {:noreply, assign(socket, exporting: false)}
  end

  def handle_event("export_failed", %{"reason" => reason}, socket) do
    require Logger
    Logger.error("Map export failed: #{reason}")
    {:noreply, assign(socket, exporting: false)}
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
      # If pattern tool is already active, stay in pattern mode; otherwise switch to stamp
      tool = if socket.assigns.active_tool == "pattern", do: "pattern", else: "stamp"

      {:noreply,
       socket
       |> assign(active_stamp_asset: asset, active_tool: tool)
       |> push_event("set_tool", %{tool: tool, stamp_asset: encode_stamp_asset(asset)})}
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
        # Enqueue AI lore generation via Oban
        %{lore_entry_id: lore_entry.id, stamp_name: name, stamp_type: lore_type}
        |> ParchmentStudios.Workers.GenerateLore.new()
        |> Oban.insert()

        # Subscribe to PubSub for this lore entry's generation result
        Phoenix.PubSub.subscribe(ParchmentStudios.PubSub, "lore:#{lore_entry.id}")

        {:noreply,
         socket
         |> assign(generating_lore: true, selected_object_id: stamp_id)
         |> push_event("lore_entry_created", %{stamp_id: stamp_id, lore_id: lore_entry.id})}

      {:error, _changeset} ->
        # Non-fatal: stamp is placed, lore just won't be linked
        {:noreply, socket}
    end
  end

  def handle_event("stamp_placed", _params, socket) do
    {:noreply, socket}
  end

  def handle_event("pattern_stroke_placed", %{"count" => _count}, socket) do
    {:noreply, socket}
  end

  def handle_event("path_placed", %{"style" => _style, "waypoint_count" => _count}, socket) do
    {:noreply, socket}
  end

  def handle_event(
        "region_placed",
        %{"fill_style" => _style, "vertex_count" => _count, "object_id" => object_id},
        socket
      ) do
    project_id = socket.assigns.project.id

    case Worlds.create_lore_entry(%{
           title: "Unnamed Region",
           type: "place",
           content: "",
           project_id: project_id
         }) do
      {:ok, lore_entry} ->
        {:noreply,
         push_event(socket, "lore_entry_created", %{
           object_id: object_id,
           lore_id: lore_entry.id
         })}

      {:error, _changeset} ->
        {:noreply, socket}
    end
  end

  def handle_event("set_region_style", _params, socket), do: {:noreply, socket}

  def handle_event("set_path_style", %{"style" => style}, socket) do
    {:noreply,
     socket
     |> push_event("set_path_style", %{style: style})}
  end

  # When a stamp is clicked (no loreId) → just deselect lore panel
  def handle_event("object_selected", %{"id" => id, "lore_id" => nil}, socket) do
    {:noreply,
     assign(socket,
       selected_lore_entry: nil,
       lore_entry_form: nil,
       selected_object_id: id
     )}
  end

  def handle_event("object_selected", %{"id" => id, "lore_id" => ""}, socket) do
    {:noreply,
     assign(socket,
       selected_lore_entry: nil,
       lore_entry_form: nil,
       selected_object_id: id
     )}
  end

  # When a stamp with a loreId is clicked → open the lore panel
  def handle_event("object_selected", %{"id" => id, "lore_id" => lore_id}, socket)
      when is_binary(lore_id) do
    lore_entry = Worlds.get_lore_entry!(lore_id)
    form = to_form(Worlds.change_lore_entry(lore_entry))

    {:noreply,
     assign(socket,
       selected_lore_entry: lore_entry,
       lore_entry_form: form,
       selected_object_id: id
     )}
  end

  def handle_event("object_selected", _params, socket) do
    {:noreply,
     assign(socket,
       selected_lore_entry: nil,
       lore_entry_form: nil,
       selected_object_id: nil
     )}
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

  def handle_event("find_on_map", _params, socket) do
    if socket.assigns.selected_object_id do
      {:noreply,
       push_event(socket, "fly_to_object", %{object_id: socket.assigns.selected_object_id})}
    else
      {:noreply, socket}
    end
  end

  def handle_event("close_lore_panel", _params, socket) do
    {:noreply,
     assign(socket, selected_lore_entry: nil, lore_entry_form: nil, selected_object_id: nil)}
  end

  @impl true
  def handle_info({:lore_generated, lore_entry}, socket) do
    {:noreply,
     socket
     |> assign(
       generating_lore: false,
       selected_lore_entry: lore_entry,
       lore_entry_form: to_form(Worlds.change_lore_entry(lore_entry))
     )
     |> push_event("lore_generated", %{lore_id: lore_entry.id})}
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

  defp tool_icon("select"), do: "hero-cursor-arrow-rays"
  defp tool_icon("pan"), do: "hero-hand-raised"
  defp tool_icon("stamp"), do: "hero-square-2-stack"
  defp tool_icon("pattern"), do: "hero-squares-plus"
  defp tool_icon("path"), do: "hero-pencil"
  defp tool_icon("brush"), do: "hero-paint-brush"
  defp tool_icon("text"), do: "hero-language"
  defp tool_icon("region"), do: "hero-map"
  defp tool_icon(_), do: "hero-cursor-arrow-rays"

  defp tool_label("select"), do: "Select"
  defp tool_label("pan"), do: "Pan"
  defp tool_label("stamp"), do: "Stamp"
  defp tool_label("pattern"), do: "Pattern"
  defp tool_label("path"), do: "Path"
  defp tool_label("brush"), do: "Brush"
  defp tool_label("text"), do: "Text"
  defp tool_label("region"), do: "Region"
  defp tool_label(_), do: "Select"

  defp layer_dot_color("terrain"), do: "bg-green-500"
  defp layer_dot_color("water"), do: "bg-blue-500"
  defp layer_dot_color("features"), do: "bg-amber-700"
  defp layer_dot_color("labels"), do: "bg-gray-400"
  defp layer_dot_color("effects"), do: "bg-purple-500"
  defp layer_dot_color(_), do: "bg-gray-500"

  @impl true
  def render(assigns) do
    ~H"""
    <div class="flex flex-col h-screen overflow-hidden" style="background: #F5EDD6;">
      <%!-- TOP BAR --%>
      <div
        class="h-10 flex items-center px-5 flex-shrink-0"
        style="background: rgba(245,237,214,0.85); backdrop-filter: blur(8px); border-bottom: 1px solid rgba(139,105,20,0.15);"
      >
        <%!-- Left: breadcrumb --%>
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <.icon name="hero-map" class="w-5 h-5 text-amber-500 flex-shrink-0" />
          <.link
            navigate={~p"/projects"}
            class="text-sm text-base-content/60 hover:text-base-content transition-colors truncate"
          >
            {@project && @project.name}
          </.link>
          <span class="text-base-content/30 flex-shrink-0">&rsaquo;</span>
          <span class="text-sm font-medium truncate">{@world_map && @world_map.name}</span>
        </div>
        <%!-- Center: zoom --%>
        <div class="flex-1 text-center">
          <span class="text-xs text-base-content/50 font-mono">{@zoom_level}%</span>
        </div>
        <%!-- Right: export + layers toggle + settings --%>
        <div class="flex items-center gap-2 flex-1 justify-end">
          <button
            phx-click="show_export_modal"
            class={"btn btn-ghost btn-sm gap-1 #{if @exporting, do: "loading"}"}
            title="Export map as PNG"
            disabled={@exporting}
          >
            <%= if @exporting do %>
              <span class="loading loading-spinner loading-xs"></span> Exporting…
            <% else %>
              <.icon name="hero-arrow-down-tray" class="w-4 h-4" /> Export
            <% end %>
          </button>
          <button
            phx-click="toggle_layer_panel"
            class={"btn btn-ghost btn-sm gap-1 #{if @layer_panel_open, do: "text-amber-500"}"}
          >
            <.icon name="hero-squares-2x2" class="w-4 h-4" /> Layers
          </button>
          <button class="btn btn-ghost btn-sm btn-square" title="Settings">
            <.icon name="hero-cog-6-tooth" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <%!-- EXPORT MODAL --%>
      <div
        :if={@show_export_modal}
        class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
        phx-click="hide_export_modal"
      >
        <div
          class="bg-base-100 rounded-lg shadow-xl w-80 p-5"
          phx-click-away="hide_export_modal"
          onclick="event.stopPropagation()"
        >
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-serif font-bold">Export Map</h3>
            <button phx-click="hide_export_modal" class="btn btn-ghost btn-sm btn-square">
              <.icon name="hero-x-mark" class="w-4 h-4" />
            </button>
          </div>

          <form phx-change="set_export_resolution">
            <p class="text-sm font-medium mb-2">Resolution:</p>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="2k"
                checked={@export_resolution == "2k"}
                class="radio radio-sm radio-primary"
              />
              <span class="text-sm">2K (2048 × 2048)</span>
            </label>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="4k"
                checked={@export_resolution == "4k"}
                class="radio radio-sm radio-primary"
              />
              <span class="text-sm">4K (4096 × 4096)</span>
            </label>
            <label class="flex items-center gap-2 py-1 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value="8k"
                checked={@export_resolution == "8k"}
                class="radio radio-sm radio-primary"
              />
              <span class="text-sm">8K (8192 × 8192)</span>
            </label>
          </form>

          <p class="text-xs text-base-content/50 mt-3 mb-4">
            Note: 8K may take ~10 seconds
          </p>

          <button phx-click="export_map" class="btn btn-primary btn-sm w-full gap-1">
            <.icon name="hero-arrow-down-tray" class="w-4 h-4" /> Export PNG
          </button>
        </div>
      </div>

      <%!-- MAIN AREA --%>
      <div class="flex flex-1 overflow-hidden">
        <%!-- CANVAS AREA --%>
        <div class="flex-1 flex flex-col relative overflow-hidden">
          <div class="flex-1 relative">
            <%!-- Map container --%>
            <div
              id="map-container"
              phx-hook="MapEditorHook"
              phx-update="ignore"
              data-locations={Jason.encode!(encode_locations(@locations))}
              class="w-full h-full"
            >
            </div>

            <%!-- RADIAL TOOL WHEEL --%>
            <div id="tool-wheel" class="tool-wheel absolute bottom-4 left-4 z-[100]">
              <button class="tool-wheel__anchor" type="button" title={tool_label(@active_tool)}>
                <.icon name={tool_icon(@active_tool)} class="w-6 h-6" />
              </button>
              <span class="tool-wheel__label">{tool_label(@active_tool)}</span>
              <div
                :for={{tool, idx} <- Enum.with_index(@tools)}
                class="tool-wheel__item"
                style={"--i: #{idx}; --n: #{length(@tools)}"}
                phx-click="set_tool"
                phx-value-tool={tool.id}
              >
                <button
                  class={"tool-wheel__btn #{if @active_tool == tool.id, do: "tool-wheel__btn--active"}"}
                  type="button"
                  title={"#{tool.label} (#{tool.key})"}
                >
                  <.icon name={tool.icon} class="w-5 h-5" />
                </button>
              </div>
            </div>

            <%!-- LAYER PANEL (top-right overlay) --%>
            <div
              :if={@layer_panel_open}
              class="absolute top-3 right-3 z-[100] w-56 bg-base-100/95 backdrop-blur rounded-lg shadow-lg border border-base-content/10"
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
              <div class="max-h-48 overflow-y-auto p-1">
                <div
                  :for={layer <- Enum.reverse(@layers)}
                  class={"flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-base-200 text-xs #{if @active_layer == layer.id, do: "bg-primary/10"}"}
                  phx-click="set_active_layer"
                  phx-value-id={layer.id}
                >
                  <span class={"w-2 h-2 rounded-full flex-shrink-0 #{layer_dot_color(layer.type)}"}>
                  </span>
                  <span class="flex-1 truncate">{layer.name}</span>
                  <button
                    phx-click="toggle_layer_visibility"
                    phx-value-id={layer.id}
                    class="opacity-50 hover:opacity-100 flex-shrink-0"
                    title={if layer.visible, do: "Hide layer", else: "Show layer"}
                  >
                    <.icon
                      name={if layer.visible, do: "hero-eye", else: "hero-eye-slash"}
                      class="w-3.5 h-3.5"
                    />
                  </button>
                </div>
              </div>
              <%!-- Opacity slider --%>
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
              <%!-- Light angle slider --%>
              <div class="px-3 py-2 border-t border-base-content/10">
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-base-content/40 w-12 leading-tight">Light</span>
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
                  <span class="text-[10px] text-base-content/40 w-8 text-right">
                    {@light_angle_deg}°
                  </span>
                </div>
              </div>
            </div>
          </div>

          <%!-- Brush options panel (only when brush tool active) --%>
          <div
            :if={@active_tool == "brush"}
            class="bg-base-100/95 border-t border-base-content/10 flex-shrink-0 px-4 py-2"
          >
            <div class="flex items-center gap-6 flex-wrap">
              <span class="text-xs font-bold font-serif tracking-wide text-base-content/60">
                BRUSH
              </span>

              <%!-- Color swatches --%>
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-base-content/40 mr-1">Color</span>
                <button
                  :for={
                    {color, label} <- [
                      {"#4a7c59", "Forest"},
                      {"#8ab87a", "Grassland"},
                      {"#c9a96e", "Desert"},
                      {"#7a7a8c", "Mountain"},
                      {"#4a7fa5", "Water"}
                    ]
                  }
                  phx-click="set_brush_color"
                  phx-value-color={color}
                  class={"w-6 h-6 rounded-full border-2 transition-all cursor-pointer #{if @brush_color == color, do: "border-primary scale-110", else: "border-transparent hover:border-base-content/30"}"}
                  style={"background: #{color};"}
                  title={label}
                />
              </div>

              <%!-- Size slider --%>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/40 w-6">Size</span>
                <input
                  type="range"
                  min="4"
                  max="120"
                  step="2"
                  value={@brush_size}
                  phx-change="set_brush_size"
                  name="size"
                  class="range range-xs range-primary w-28"
                />
                <span class="text-[10px] text-base-content/40 w-8">{@brush_size}px</span>
              </div>

              <%!-- Opacity slider --%>
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-base-content/40 w-10">Opacity</span>
                <input
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={@brush_opacity}
                  phx-change="set_brush_opacity"
                  name="opacity"
                  class="range range-xs range-primary w-28"
                />
                <span class="text-[10px] text-base-content/40 w-8">{@brush_opacity}%</span>
              </div>
            </div>
          </div>

          <%!-- Asset library dock (when stamp or pattern tool active) --%>
          <div
            :if={@active_tool in ["stamp", "pattern"] && @asset_library != %{}}
            class="bg-base-100/95 border-t border-base-content/10 flex-shrink-0"
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
        </div>

        <%!-- RIGHT PANEL - Lore Entry --%>
        <div
          :if={@selected_lore_entry || @generating_lore}
          class="w-[280px] bg-base-100 border-l border-base-content/10 overflow-y-auto flex-shrink-0"
        >
          <div class="p-3">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <.icon name="hero-book-open" class="w-4 h-4 text-primary" />
                <span class="text-sm font-bold text-base-content/60 uppercase tracking-wider">
                  Lore
                </span>
              </div>
              <button phx-click="close_lore_panel" class="btn btn-ghost btn-sm btn-square">
                <.icon name="hero-x-mark" class="w-4 h-4" />
              </button>
            </div>

            <div
              :if={@generating_lore && !@selected_lore_entry}
              class="flex items-center gap-2 py-8 justify-center text-base-content/60"
            >
              <span class="loading loading-spinner loading-sm"></span>
              <span class="text-sm">Generating lore...</span>
            </div>

            <div :if={@selected_lore_entry}>
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
                <button
                  :if={@selected_object_id}
                  phx-click="find_on_map"
                  class="btn btn-ghost btn-sm gap-1 w-full mb-2"
                >
                  <.icon name="hero-map-pin" class="w-4 h-4" /> Find on Map
                </button>
                <p class="text-xs text-base-content/40 font-mono">
                  id: {to_string(@selected_lore_entry.id) |> String.slice(0, 8)}...
                </p>
              </div>
            </div>
          </div>
        </div>

        <%!-- RIGHT PANEL - Location Detail --%>
        <div
          :if={@selected_location}
          class="w-[280px] bg-base-100 border-l border-base-content/10 overflow-y-auto flex-shrink-0"
        >
          <div class="p-3">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-serif font-bold truncate">{@selected_location.name}</h3>
              <button phx-click="close_panel" class="btn btn-ghost btn-sm btn-square flex-shrink-0">
                <.icon name="hero-x-mark" class="w-4 h-4" />
              </button>
            </div>

            <div class="badge badge-primary badge-sm font-serif mb-3">
              {@selected_location.type |> String.replace("_", " ") |> String.capitalize()}
            </div>

            <.form
              for={@location_form}
              phx-change="update_location"
              phx-submit="update_location"
            >
              <.input field={@location_form[:name]} label="Name" />
              <.input
                field={@location_form[:type]}
                label="Type"
                type="select"
                options={
                  Enum.map(
                    @location_types,
                    &{String.replace(&1, "_", " ") |> String.capitalize(), &1}
                  )
                }
              />
              <.input
                field={@location_form[:description]}
                label="Description"
                type="textarea"
                rows="3"
              />
              <.input field={@location_form[:lore]} label="Lore" type="textarea" rows="5" />
            </.form>

            <div class="flex gap-2 mt-3">
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

            <div :if={@selected_location.artwork_url} class="mt-3">
              <img src={@selected_location.artwork_url} class="rounded-lg w-full" />
            </div>

            <div
              :if={@selected_location.stats["art_prompt"]}
              class="mt-3 p-2 bg-base-200 rounded-lg"
            >
              <p class="text-xs font-bold text-base-content/50 mb-1">Art Prompt</p>
              <p class="text-xs text-base-content/70 italic">
                {@selected_location.stats["art_prompt"]}
              </p>
            </div>

            <div class="mt-3 pt-3 border-t border-base-content/10">
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
    </div>
    """
  end
end
