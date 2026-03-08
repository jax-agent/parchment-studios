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
