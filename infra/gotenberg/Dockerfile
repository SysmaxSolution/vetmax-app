# =============================================================================
# Gotenberg para VetMax — extends da imagem oficial estavel.
#
# Mantemos um Dockerfile (em vez de apontar `image = ...` no fly.toml) para:
#   1. Permitir customizacao futura (instalar fontes da clinica via apt)
#   2. Manter visivel a versao usada (auditoria/changelog)
#   3. Reproduzir local com `docker build -t vetmax-gotenberg .`
#
# Para usar sem Dockerfile, comente o `[build] dockerfile` no fly.toml e
# descomente `[build] image = "gotenberg/gotenberg:8"`.
# =============================================================================

FROM gotenberg/gotenberg:8

# Gotenberg 8 ja inclui:
#   - LibreOffice headless (soffice)
#   - Chromium (HTML/Markdown -> PDF)
#   - pdftk-java (manipulacao PDF)
#   - libreoffice-fonts-* (DejaVu, Liberation, Carlito, Caladea)
#   - hyphen-pt-br (hifenizacao PT-BR)
#
# Se a clinica usar fonte exotica (ex: AlmaVet usa Calibri/Cambria),
# descomente abaixo e adicione o arquivo .ttf neste diretorio:
#
# USER root
# COPY fonts/*.ttf /usr/share/fonts/truetype/clinica/
# RUN fc-cache -fv
# USER gotenberg

# Default exposto: 3000 (API REST do Gotenberg)
EXPOSE 3000

# Command default da imagem upstream:
#   ENTRYPOINT ["gotenberg"]
# Sobrescrito no fly.toml [experimental] cmd para passar flags.
