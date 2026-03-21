from pprint import pprint

from app.clients.patti_client import PattiClient


def main() -> None:
    client = PattiClient()
    client.login()

    service_histories = client.get_service_histories_by_person_id(3416)

    print("Patti login successful.")
    pprint(service_histories)


if __name__ == "__main__":
    main()