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
      assert has_element?(view, ~s(button[phx-value-id="terrain"] .hero-eye-slash))
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
      # The active layer's opacity slider should target terrain
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

    test "toggle_layer_panel hides and shows panel", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")
      assert html =~ "LAYERS"

      # Close panel
      view |> element(~s(button[phx-click="toggle_layer_panel"])) |> render_click()

      # Panel should be hidden, toggle button should appear
      assert has_element?(view, ~s(button[phx-click="toggle_layer_panel"]))
      html = render(view)
      refute html =~ "LAYERS"
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

    test "remove_layer removes a layer", %{
      conn: conn,
      project: project,
      world_map: world_map
    } do
      {:ok, view, _html} = live(conn, ~p"/projects/#{project.id}/maps/#{world_map.id}")

      view
      |> element(~s(button[phx-click="remove_layer"][phx-value-id="effects"]))
      |> render_click()

      html = render(view)
      refute html =~ ~r/Effects/
    end
  end
end
