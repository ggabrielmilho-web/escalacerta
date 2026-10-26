FROM python:3.11-slim

WORKDIR /app
COPY servidor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# só o código do servidor e a pasta do site; o .env entra pelo ambiente do serviço, nunca na imagem
COPY servidor/*.py ./
COPY gerador/ /site/

ENV SITE=/site
RUN useradd --create-home escala
USER escala

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
