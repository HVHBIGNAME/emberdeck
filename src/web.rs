use axum::{
    body::Body,
    extract::Request,
    http::{StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Response},
};

include!(concat!(env!("OUT_DIR"), "/assets.rs"));

pub async fn asset(request: Request) -> Response {
    if request.method() != axum::http::Method::GET && request.method() != axum::http::Method::HEAD {
        return StatusCode::METHOD_NOT_ALLOWED.into_response();
    }
    let path = request.uri().path().trim_start_matches('/');
    if path.starts_with("api/") {
        return (
            StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({"error":"Unknown API endpoint"})),
        )
            .into_response();
    }
    let found = ASSETS.iter().find(|(name, _)| *name == path).or_else(|| {
        if !path.contains('.') {
            ASSETS.iter().find(|(name, _)| *name == "index.html")
        } else {
            None
        }
    });
    let Some((name, bytes)) = found else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let content_type = mime_guess::from_path(name)
        .first_or_octet_stream()
        .to_string();
    let cache = if name.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };
    let body = if request.method() == axum::http::Method::HEAD {
        Body::empty()
    } else {
        Body::from(*bytes)
    };
    (
        [
            (header::CONTENT_TYPE, content_type),
            (header::CACHE_CONTROL, cache.into()),
        ],
        body,
    )
        .into_response()
}

pub async fn headers(request: Request, next: Next) -> Response {
    let api = request.uri().path().starts_with("/api/");
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        "x-content-type-options",
        "nosniff".parse().expect("constant header"),
    );
    headers.insert("x-frame-options", "DENY".parse().expect("constant header"));
    headers.insert(
        "referrer-policy",
        "same-origin".parse().expect("constant header"),
    );
    headers.insert("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'".parse().expect("constant header"));
    if api {
        headers.insert(
            header::CACHE_CONTROL,
            "no-store".parse().expect("constant header"),
        );
    }
    response
}
