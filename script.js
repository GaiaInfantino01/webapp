let html5QrCode;
let books = JSON.parse(localStorage.getItem("books")) || [];

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const manualBtn = document.getElementById("manualBtn");
const exportBtn = document.getElementById("exportBtn");
const clearBtn = document.getElementById("clearBtn");
const statusText = document.getElementById("status");
const tableBody = document.querySelector("#booksTable tbody");

renderTable();

startBtn.addEventListener("click", startScanner);
stopBtn.addEventListener("click", stopScanner);
manualBtn.addEventListener("click", searchManualISBN);
exportBtn.addEventListener("click", exportExcel);
clearBtn.addEventListener("click", clearBooks);

async function startScanner() {
  try {
    html5QrCode = new Html5Qrcode("reader");

    const config = {
      fps: 10,
      qrbox: { width: 260, height: 160 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E
      ]
    };

    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        const isbn = cleanISBN(decodedText);

        if (isbn.length === 10 || isbn.length === 13) {
          statusText.textContent = `ISBN rilevato: ${isbn}`;
          await stopScanner();
          await fetchBookData(isbn);
        }
      }
    );

    statusText.textContent = "Fotocamera attiva. Inquadra il codice ISBN.";
  } catch (error) {
    statusText.textContent = "Errore: impossibile avviare la fotocamera.";
    console.error(error);
  }
}

async function stopScanner() {
  if (html5QrCode) {
    try {
      await html5QrCode.stop();
      await html5QrCode.clear();
      statusText.textContent = "Fotocamera fermata.";
    } catch (error) {
      console.warn(error);
    }
  }
}

function searchManualISBN() {
  const isbn = cleanISBN(document.getElementById("manualIsbn").value);

  if (!isbn) {
    statusText.textContent = "Inserisci un ISBN valido.";
    return;
  }

  fetchBookData(isbn);
  document.getElementById("manualIsbn").value = "";
}

function cleanISBN(value) {
  return String(value).replace(/[^0-9Xx]/g, "");
}

async function fetchBookData(isbn) {
  if (books.some(book => book.ISBN === isbn)) {
    statusText.textContent = "Questo libro è già presente nella lista.";
    return;
  }

  statusText.textContent = "Cerco i dati del libro...";

  let book = await searchGoogleBooks(isbn);

  if (!book) {
    book = await searchOpenLibrary(isbn);
  }

  if (!book) {
    book = {
      ISBN: isbn,
      Titolo: "",
      Autore: "",
      Genere: "",
      Abstract: "",
      Pagine: "",
      Lingua: "",
      Editore: "",
      Luogo: "",
      Data: ""
    };

    statusText.textContent = "Libro non trovato online. Puoi completarlo manualmente.";
  } else {
    statusText.textContent = "Libro aggiunto correttamente.";
  }

  books.push(book);
  saveBooks();
  renderTable();
}

async function searchGoogleBooks(isbn) {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items || data.items.length === 0) return null;

    const info = data.items[0].volumeInfo;

    return {
      ISBN: isbn,
      Titolo: info.title || "",
      Autore: info.authors ? info.authors.join(", ") : "",
      Genere: info.categories ? info.categories.join(", ") : "",
      Abstract: info.description || "",
      Pagine: info.pageCount || "",
      Lingua: info.language || "",
      Editore: info.publisher || "",
      Luogo: "",
      Data: info.publishedDate || ""
    };
  } catch (error) {
    console.error("Errore Google Books:", error);
    return null;
  }
}

async function searchOpenLibrary(isbn) {
  try {
    const url = `https://openlibrary.org/isbn/${isbn}.json`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();

    return {
      ISBN: isbn,
      Titolo: data.title || "",
      Autore: "",
      Genere: data.subjects ? data.subjects.join(", ") : "",
      Abstract: data.description
        ? typeof data.description === "string"
          ? data.description
          : data.description.value
        : "",
      Pagine: data.number_of_pages || "",
      Lingua: data.languages ? data.languages.map(l => l.key.replace("/languages/", "")).join(", ") : "",
      Editore: data.publishers ? data.publishers.join(", ") : "",
      Luogo: data.publish_places ? data.publish_places.join(", ") : "",
      Data: data.publish_date || ""
    };
  } catch (error) {
    console.error("Errore Open Library:", error);
    return null;
  }
}

function renderTable() {
  tableBody.innerHTML = "";

  books.forEach((book, index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      ${editableCell(index, "ISBN", book.ISBN)}
      ${editableCell(index, "Titolo", book.Titolo)}
      ${editableCell(index, "Autore", book.Autore)}
      ${editableCell(index, "Genere", book.Genere)}
      ${editableTextarea(index, "Abstract", book.Abstract)}
      ${editableCell(index, "Pagine", book.Pagine)}
      ${editableCell(index, "Lingua", book.Lingua)}
      ${editableCell(index, "Editore", book.Editore)}
      ${editableCell(index, "Luogo", book.Luogo)}
      ${editableCell(index, "Data", book.Data)}
      <td><button class="delete-btn" onclick="deleteBook(${index})">Elimina</button></td>
    `;

    tableBody.appendChild(row);
  });
}

function editableCell(index, field, value) {
  return `
    <td>
      <input 
        value="${escapeHtml(value)}" 
        onchange="updateBook(${index}, '${field}', this.value)"
      />
    </td>
  `;
}

function editableTextarea(index, field, value) {
  return `
    <td>
      <textarea onchange="updateBook(${index}, '${field}', this.value)">${escapeHtml(value)}</textarea>
    </td>
  `;
}

function updateBook(index, field, value) {
  books[index][field] = value;
  saveBooks();
}

function deleteBook(index) {
  books.splice(index, 1);
  saveBooks();
  renderTable();
}

function clearBooks() {
  if (confirm("Vuoi davvero svuotare tutta la lista?")) {
    books = [];
    saveBooks();
    renderTable();
    statusText.textContent = "Lista svuotata.";
  }
}

function saveBooks() {
  localStorage.setItem("books", JSON.stringify(books));
}

function exportExcel() {
  if (books.length === 0) {
    statusText.textContent = "Non ci sono libri da esportare.";
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(books);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Libri Biblioteca");
  XLSX.writeFile(workbook, "catalogo_libri.xlsx");

  statusText.textContent = "File Excel generato.";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
