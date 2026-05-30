FROM rust:1.88-bookworm

# Node.js 22 LTS
RUN apt-get update && apt-get install -y \
    curl \
    git \
    pkg-config \
    build-essential \
    binaryen \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# WASM tooling
RUN rustup target add wasm32-unknown-unknown

RUN cargo install \
    wasm-pack \
    cargo-watch \
    wasm-bindgen-cli

WORKDIR /workspace

EXPOSE 5173

CMD ["bash"]