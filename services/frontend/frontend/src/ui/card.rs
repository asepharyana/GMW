use leptos::prelude::*;


#[component]
pub fn Card(
    #[prop(optional)] elevated: bool,
    #[prop(optional)] bordered: bool,
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    let combined = format!("card {}", class);

    view! {
        <div
            class=combined
            class:card-elevated=elevated
            class:card-bordered=bordered
        >
            {children()}
        </div>
    }
}

#[component]
pub fn CardHeader(children: Children) -> impl IntoView {
    view! { <div class="card-header">{children()}</div> }
}

#[component]
pub fn CardTitle(children: Children) -> impl IntoView {
    view! { <h3 class="card-title">{children()}</h3> }
}

#[component]
pub fn CardDescription(children: Children) -> impl IntoView {
    view! { <p class="card-description">{children()}</p> }
}

#[component]
pub fn CardContent(children: Children) -> impl IntoView {
    view! { <div class="card-content">{children()}</div> }
}

#[component]
pub fn CardFooter(children: Children) -> impl IntoView {
    view! { <div class="card-footer">{children()}</div> }
}
