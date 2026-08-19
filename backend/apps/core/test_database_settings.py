from django.test import SimpleTestCase

from config.settings.database import database_from_url


class DatabaseFromUrlTests(SimpleTestCase):
    def test_local_keeps_persistent_connections(self):
        config = database_from_url(conn_max_age=600, ssl_require=False)
        self.assertEqual(config["CONN_MAX_AGE"], 600)
        self.assertFalse(config.get("DISABLE_SERVER_SIDE_CURSORS"))

    def test_serverless_does_not_persist_connections(self):
        config = database_from_url(conn_max_age=0, ssl_require=True)
        self.assertEqual(config["CONN_MAX_AGE"], 0)
        self.assertTrue(config["DISABLE_SERVER_SIDE_CURSORS"])
        self.assertTrue(config["CONN_HEALTH_CHECKS"])
