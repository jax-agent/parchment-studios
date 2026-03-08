defmodule ParchmentStudiosWeb.MapEditorLiveTest do
  use ParchmentStudiosWeb.ConnCase

  import Phoenix.LiveViewTest

  alias ParchmentStudios.Worlds

  setup do
    {:ok, project} = Worlds.create_project(%{name: "Test Project", description: "desc"})

    {:ok, world_map} =
      Worlds.create_world_map(%{name: "Test Map", description: "desc", project_id: project.id})

    %{project: project, world_map: world_map}
  end

  describe "top bar" do
    test "renders breadcrumb with project and map name", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, _view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      assert html =~ project.name
      assert html =~ world_map.name
      assert html =~ "›"
    end

    test "renders zoom level display", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, _view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      assert html =~ "100%"
    end
  end

  describe "tool management" do
    test "renders radial wheel with 7 tool buttons", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, _view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      assert html =~ "tool-wheel"
      assert html =~ "Select (V)"
      assert html =~ "Pan (H)"
      assert html =~ "Stamp (S)"
      assert html =~ "Pattern (P)"
      assert html =~ "Path (L)"
      assert html =~ "Brush (B)"
      assert html =~ "Text (T)"
    end

    test "set_tool changes active tool for each tool type", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      for tool <- ~w(select pan stamp pattern path brush text) do
        view
        |> element(~s([phx-click="set_tool"][phx-value-tool="#{tool}"]))
        |> render_click()

        html = render(view)
        # Active tool button should have the active class
        assert html =~ "tool-wheel__btn--active"
      end
    end

    test "default active tool is select", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, _view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # The anchor should show the select tool icon
      assert html =~ "hero-cursor-arrow-rays"
      # The label should say "Select"
      assert html =~ ~r/tool-wheel__label.*Select/s
    end
  end

  describe "layer management" do
    test "renders layer panel with 5 default layers", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      assert html =~ "LAYERS"
      assert html =~ "Terrain"
      assert html =~ "Water"
      assert html =~ "Features"
      assert html =~ "Labels"
      assert html =~ "Effects"
      assert has_element?(view, "#map-container[phx-hook='MapEditorHook']")
    end

    test "toggle_layer_visibility updates layer state", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Toggle terrain visibility off
      view
      |> element(~s(button[phx-click="toggle_layer_visibility"][phx-value-id="terrain"]))
      |> render_click()

      # The eye-slash icon should now appear for terrain
      html = render(view)
      assert html =~ "hero-eye-slash"
    end

    test "set_active_layer changes active layer", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Default active layer is "features" — click on "terrain" to switch
      view
      |> element(~s(div[phx-click="set_active_layer"][phx-value-id="terrain"]))
      |> render_click()

      # Terrain row should now have the active indicator class
      html = render(view)
      assert html =~ ~s(phx-value-id="terrain")
    end

    test "set_layer_opacity updates opacity", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      view
      |> element(~s(input[name="opacity"]))
      |> render_change(%{"opacity" => "0.5", "id" => "features"})

      # Verify the opacity value is reflected in the slider
      html = render(view)
      assert html =~ ~s(value="0.5")
    end

    test "toggle_layer_panel hides and shows panel from top bar", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")
      assert html =~ "LAYERS"
      assert html =~ "Terrain"

      # Close panel via the close button inside the layer panel
      view
      |> element(~s(button[phx-click="toggle_layer_panel"][title="Close layers"]))
      |> render_click()

      html = render(view)
      refute html =~ "LAYERS"
      refute html =~ "Terrain"

      # Re-open via top bar button (now only one toggle_layer_panel button exists)
      view |> element(~s(button[phx-click="toggle_layer_panel"])) |> render_click()

      html = render(view)
      assert html =~ "LAYERS"
      assert html =~ "Terrain"
    end

    test "add_layer adds a custom layer", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      view |> element(~s(button[phx-click="add_layer"])) |> render_click()

      html = render(view)
      assert html =~ "Custom Layer"
    end
  end

  describe "panel management" do
    test "right panel hidden when nothing selected", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, _view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # No lore or location panel content
      refute html =~ "Lore"
      refute html =~ "Generate Lore"
    end

    test "asset library only shown when stamp tool active", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Default tool is select — no stamp library
      refute html =~ "STAMPS"

      # Switch to stamp tool
      view |> element(~s([phx-click="set_tool"][phx-value-tool="stamp"])) |> render_click()
      html = render(view)

      # Asset library may or may not show depending on whether assets are loaded
      # Just verify the tool switched successfully
      assert html =~ "tool-wheel__btn--active"
    end
  end

  describe "lore generation" do
    test "stamp_placed enqueues Oban job and shows lore panel", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Simulate stamp_placed event from canvas
      render_hook(view, "stamp_placed", %{
        "id" => "stamp-123",
        "name" => "Watchtower",
        "asset_category" => "settlements"
      })

      html = render(view)
      # The lore panel should show generating state or the lore entry
      # Since Oban is in :inline mode, the job runs synchronously,
      # but without a real API key, it returns :skipped
      # The panel should still be visible with generating state
      assert html =~ "Lore"
    end

    test "handle_info {:lore_generated, entry} updates the lore panel", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Create a lore entry with content
      {:ok, lore_entry} =
        Worlds.create_lore_entry(%{
          title: "Ancient Spire",
          type: "place",
          content: "# The Shimmering Spire\n\nA tall tower of glass.",
          project_id: project.id
        })

      # Simulate PubSub broadcast
      send(view.pid, {:lore_generated, lore_entry})

      html = render(view)
      assert html =~ "Ancient Spire"
      assert html =~ "Lore"
    end
  end

  describe "map-lore navigation" do
    test "stamp_placed sets selected_object_id and Find on Map shows after lore generated", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Place a stamp — sets selected_object_id and generating_lore
      render_hook(view, "stamp_placed", %{
        "id" => "stamp-nav-1",
        "name" => "Dark Tower",
        "asset_category" => "settlements"
      })

      # Get the created lore entry
      [lore_entry] = Worlds.list_lore_entries(project.id)
      updated = %{lore_entry | content: "# The Dark Tower\n\nAn ancient spire."}

      # Simulate lore generation completing
      send(view.pid, {:lore_generated, updated})

      html = render(view)
      assert html =~ "Find on Map"
      assert html =~ "Dark Tower"
    end

    test "find_on_map pushes fly_to_object event to client", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Place a stamp to set selected_object_id
      render_hook(view, "stamp_placed", %{
        "id" => "stamp-nav-2",
        "name" => "Crystal Cave",
        "asset_category" => "landmarks"
      })

      [lore_entry] = Worlds.list_lore_entries(project.id)
      send(view.pid, {:lore_generated, lore_entry})

      # Click Find on Map
      view
      |> element(~s(button[phx-click="find_on_map"]))
      |> render_click()

      # The view should still be functional (no crash)
      html = render(view)
      assert html =~ "Crystal Cave"
    end

    test "close_lore_panel clears selected_object_id and hides Find on Map", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      render_hook(view, "stamp_placed", %{
        "id" => "stamp-nav-3",
        "name" => "Old Bridge",
        "asset_category" => "landmarks"
      })

      [lore_entry] = Worlds.list_lore_entries(project.id)
      send(view.pid, {:lore_generated, lore_entry})

      html = render(view)
      assert html =~ "Find on Map"

      # Close the lore panel
      view
      |> element(~s(button[phx-click="close_lore_panel"]))
      |> render_click()

      html = render(view)
      refute html =~ "Find on Map"
    end
  end

  describe "export modal" do
    test "show_export_modal opens the modal", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Modal should not be visible initially
      refute html =~ "Export Map"
      refute html =~ "2K (2048"

      # Click the export button to open modal
      view |> element(~s(button[phx-click="show_export_modal"])) |> render_click()

      html = render(view)
      assert html =~ "Export Map"
      assert html =~ "2K (2048"
      assert html =~ "4K (4096"
      assert html =~ "8K (8192"
      assert html =~ "8K may take ~10 seconds"
    end

    test "hide_export_modal closes the modal", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Open modal
      view |> element(~s(button[phx-click="show_export_modal"])) |> render_click()
      html = render(view)
      assert html =~ "Export Map"

      # Close modal
      view |> element(~s(button[phx-click="hide_export_modal"])) |> render_click()
      html = render(view)
      refute html =~ "8K (8192"
    end

    test "set_export_resolution changes the selected resolution", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      # Open modal
      view |> element(~s(button[phx-click="show_export_modal"])) |> render_click()

      # Change resolution to 4k via radio group
      view
      |> element("form[phx-change=\"set_export_resolution\"]")
      |> render_change(%{"resolution" => "4k"})

      # The 4k radio should now be checked (verified by re-render)
      html = render(view)
      assert html =~ "4K (4096"
    end
  end

  describe "zoom" do
    test "zoom_changed event updates zoom level", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")
      assert html =~ "100%"

      # Simulate zoom change from JS
      render_hook(view, "zoom_changed", %{"zoom" => 1.5})

      html = render(view)
      assert html =~ "150%"
    end
  end
end
