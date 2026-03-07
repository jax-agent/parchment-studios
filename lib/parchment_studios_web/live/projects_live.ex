defmodule ParchmentStudiosWeb.ProjectsLive do
  use ParchmentStudiosWeb, :live_view

  alias ParchmentStudios.Worlds

  @impl true
  def mount(_params, _session, socket) do
    {:ok,
     assign(socket,
       page_title: "Projects",
       projects: [],
       show_form: false,
       form: to_form(Worlds.change_project(%Worlds.Project{}))
     )}
  end

  @impl true
  def handle_params(_params, _uri, socket) do
    projects = Worlds.list_projects()
    {:noreply, assign(socket, projects: projects)}
  end

  @impl true
  def handle_event("new_project", _params, socket) do
    {:noreply, assign(socket, show_form: true)}
  end

  def handle_event("cancel", _params, socket) do
    {:noreply, assign(socket, show_form: false)}
  end

  def handle_event("save_project", %{"project" => project_params}, socket) do
    case Worlds.create_project(project_params) do
      {:ok, project} ->
        # Auto-create a default map
        Worlds.create_world_map(%{
          name: "#{project.name} Map",
          project_id: project.id,
          settings: %{"zoom" => 3, "center" => [0, 0]}
        })

        {:noreply,
         socket
         |> put_flash(:info, "Project created!")
         |> assign(
           show_form: false,
           projects: Worlds.list_projects(),
           form: to_form(Worlds.change_project(%Worlds.Project{}))
         )}

      {:error, changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  def handle_event("delete_project", %{"id" => id}, socket) do
    project = Worlds.get_project!(id)
    {:ok, _} = Worlds.delete_project(project)

    {:noreply,
     socket
     |> put_flash(:info, "Project deleted")
     |> assign(projects: Worlds.list_projects())}
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="min-h-screen bg-base-200">
      <div class="max-w-5xl mx-auto py-10 px-4">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h1 class="text-4xl font-serif font-bold text-base-content">
              The Cartographer's Desk
            </h1>
            <p class="text-base-content/60 mt-1 font-serif italic">
              Your worldbuilding projects await...
            </p>
          </div>
          <button phx-click="new_project" class="btn btn-primary">
            <.icon name="hero-plus" class="w-5 h-5" /> New Project
          </button>
        </div>

        <div :if={@show_form} class="card bg-base-100 shadow-xl mb-8 border border-primary/20">
          <div class="card-body">
            <h2 class="card-title font-serif">Create New World</h2>
            <.form for={@form} phx-submit="save_project">
              <.input
                field={@form[:name]}
                label="World Name"
                placeholder="The Realm of Aldoria..."
                required
              />
              <.input
                field={@form[:description]}
                label="Description"
                type="textarea"
                placeholder="A vast continent of warring kingdoms..."
              />
              <div class="card-actions justify-end mt-4">
                <button type="button" phx-click="cancel" class="btn btn-ghost">Cancel</button>
                <button type="submit" class="btn btn-primary">Create World</button>
              </div>
            </.form>
          </div>
        </div>

        <div :if={@projects == []} class="text-center py-20">
          <.icon name="hero-map" class="w-16 h-16 mx-auto text-base-content/30" />
          <p class="text-base-content/50 mt-4 font-serif text-lg">
            No worlds yet. Create your first project to begin mapping.
          </p>
        </div>

        <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <div
            :for={project <- @projects}
            class="card bg-base-100 shadow-xl border border-primary/10 hover:border-primary/30 transition-all"
          >
            <div class="card-body">
              <h2 class="card-title font-serif">{project.name}</h2>
              <p :if={project.description} class="text-base-content/60 text-sm">
                {project.description}
              </p>
              <div class="card-actions justify-between items-center mt-4">
                <button
                  phx-click="delete_project"
                  phx-value-id={project.id}
                  data-confirm="Delete this project and all its maps?"
                  class="btn btn-ghost btn-sm text-error"
                >
                  <.icon name="hero-trash" class="w-4 h-4" />
                </button>
                <.link
                  navigate={~p"/projects/#{project.id}/maps/#{first_map_id(project)}"}
                  class="btn btn-primary btn-sm"
                >
                  Open Map <.icon name="hero-arrow-right" class="w-4 h-4" />
                </.link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp first_map_id(project) do
    case Worlds.list_world_maps(project.id) do
      [map | _] -> map.id
      [] -> "new"
    end
  end
end
