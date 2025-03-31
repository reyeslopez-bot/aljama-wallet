
FROM node:18

ARG USER_ID=1000
ARG GROUP_ID=1000

# Create group if it doesn't exist
RUN getent group ${GROUP_ID} || groupadd -g ${GROUP_ID} dev

# Create user if it doesn't exist
RUN id -u ${USER_ID} >/dev/null 2>&1 || useradd -m -u ${USER_ID} -g ${GROUP_ID} dev

# Install helpful tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    vim \
    neovim \
    && rm -rf /var/lib/apt/lists/*

USER ${USER_ID}
WORKDIR /workspace

